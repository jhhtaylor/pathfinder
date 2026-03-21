// Pathfinder test: Azure Functions style code.
// The stubs at the top make this compile without the Azure Functions NuGet package.
// Open this file and check that CreateOrderAsync and GetOrderStatusAsync show
// their call trees in the Pathfinder panel.

// ── Minimal Azure Functions stubs (no NuGet package required) ─────────────────
namespace Microsoft.Azure.Functions.Worker
{
    [AttributeUsage(AttributeTargets.Method)]
    public class FunctionAttribute(string name) : Attribute { }

    [AttributeUsage(AttributeTargets.Parameter)]
    public class HttpTriggerAttribute(string authLevel, params string[] methods) : Attribute { }

    [AttributeUsage(AttributeTargets.Parameter)]
    public class QueueTriggerAttribute(string queueName) : Attribute { }

    public class HttpRequestData { public string? Body { get; set; } }
    public class HttpResponseData { public int StatusCode { get; set; } public string? Body { get; set; } }
    public class FunctionContext { }
}
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.Azure.Functions.Worker;
using PathfinderTest.Services;

namespace PathfinderTest.Functions;

public class OrderFunctions(OrderService orderService)
{
    private readonly OrderService _orderService = orderService;

    // Expected tree:
    //   CreateOrderAsync
    //   ├── ParseOrderRequest
    //   ├── _orderService.ProcessOrderAsync (cross-file)
    //   └── BuildResponse
    [Function("CreateOrder")]
    public async Task<HttpResponseData> CreateOrderAsync(
        [HttpTrigger("anonymous", "post")] HttpRequestData req,
        FunctionContext ctx)
    {
        int orderId = ParseOrderRequest(req);
        await _orderService.ProcessOrderAsync(orderId);
        return BuildResponse(new HttpResponseData(), $"Order {orderId} created");
    }

    // Expected tree:
    //   GetOrderStatusAsync
    //   ├── ExtractOrderId
    //   ├── FetchOrderStatus
    //   └── BuildResponse
    [Function("GetOrderStatus")]
    public async Task<HttpResponseData> GetOrderStatusAsync(
        [HttpTrigger("anonymous", "get")] HttpRequestData req,
        FunctionContext ctx)
    {
        int orderId = ExtractOrderId(req);
        string status = await FetchOrderStatus(orderId);
        return BuildResponse(new HttpResponseData(), status);
    }

    private int ParseOrderRequest(HttpRequestData req)
    {
        // Leaf: would deserialise req.Body
        return 1001;
    }

    private int ExtractOrderId(HttpRequestData req)
    {
        // Leaf: would parse query string
        return 1001;
    }

    private async Task<string> FetchOrderStatus(int orderId)
    {
        // Leaf: would query a database or downstream service
        await Task.Delay(5);
        return $"Order {orderId} is in transit";
    }

    private HttpResponseData BuildResponse(HttpResponseData res, string message)
    {
        // Leaf: sets status + serialises body
        res.StatusCode = 200;
        res.Body = message;
        return res;
    }
}

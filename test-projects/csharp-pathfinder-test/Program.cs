// Pathfinder test: entry point — open this file in VS Code and trigger
// the Call Hierarchy panel. You should see RunDemoAsync and SetupServices
// as root nodes, each expandable into the service call chains.

using PathfinderTest.Services;
using PathfinderTest.Extensions;

await RunDemoAsync();

static async Task RunDemoAsync()
{
    var (orderService, recursiveService) = SetupServices();

    // Basic call chain: ProcessOrderAsync → ValidateOrder → CheckInventory …
    await orderService.ProcessOrderAsync(1001);
    await orderService.ProcessOrderAsync(1002);

    // Recursive call chains
    int fib = recursiveService.Fibonacci(10);
    int fact = recursiveService.Factorial(7);
    Console.WriteLine($"Fibonacci(10)={fib}  Factorial(7)={fact}");

    // Extension methods + lambdas
    string email = "hello@example.com";
    bool valid = email.IsValidEmail();
    string title = "the quick brown fox".ToTitleCase();
    Console.WriteLine($"Valid={valid}  Title={title}");

    // LINQ demo via LambdaExamples
    var examples = new LambdaExamples();
    var formatted = examples.DemoLinqCallChain(Enumerable.Range(1, 10));
    Console.WriteLine(string.Join(", ", formatted));
}

static (OrderService, RecursiveService) SetupServices()
{
    var notifier = new NotificationService();
    var orders = new OrderService(notifier);
    var recursive = new RecursiveService();
    return (orders, recursive);
}

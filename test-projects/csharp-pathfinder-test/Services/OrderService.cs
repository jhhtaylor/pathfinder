// Pathfinder test: multi-level call chain across sync and async methods.
// Expected tree from ProcessOrderAsync:
//   ProcessOrderAsync
//   ├── ValidateOrder
//   │   ├── CheckInventory → DataService.GetStockLevel
//   │   └── CheckCustomerCredit
//   ├── CalculateTotal
//   │   └── ApplyDiscount
//   └── NotificationService.SendConfirmationAsync

namespace PathfinderTest.Services;

public class OrderService(NotificationService notificationService)
{
    private readonly NotificationService _notificationService = notificationService;

    public async Task ProcessOrderAsync(int orderId)
    {
        ValidateOrder(orderId);
        decimal total = CalculateTotal(orderId);
        Console.WriteLine($"Order {orderId} total: {total:C}");
        await _notificationService.SendConfirmationAsync(orderId);
    }

    private void ValidateOrder(int orderId)
    {
        CheckInventory(orderId);
        CheckCustomerCredit(orderId);
    }

    private decimal CalculateTotal(int orderId)
    {
        // LINQ to sum line items (values are stubbed here)
        var lineItems = new[] { 10.00m, 25.50m, 5.99m };
        decimal subtotal = lineItems.Sum();
        return ApplyDiscount(subtotal);
    }

    private void CheckInventory(int orderId)
    {
        int stock = DataService.GetStockLevel(orderId);
        if (stock <= 0)
            throw new InvalidOperationException($"No stock for order {orderId}");
    }

    private void CheckCustomerCredit(int orderId)
    {
        // Leaf: in a real app this would call a credit-check service
        Console.WriteLine($"Credit check passed for order {orderId}");
    }

    private decimal ApplyDiscount(decimal price)
    {
        // Leaf: 10% loyalty discount
        return price * 0.90m;
    }
}

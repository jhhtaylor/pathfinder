// Pathfinder test: static class — call hierarchy should resolve
// DataService.GetStockLevel as a child of OrderService.CheckInventory.

namespace PathfinderTest.Services;

public static class DataService
{
    public static int GetStockLevel(int productId)
    {
        // Leaf: stubbed — would query a database
        return productId % 3 == 0 ? 0 : 42;
    }

    public static string? GetCustomerById(int customerId)
    {
        // Leaf: stubbed — would query a database
        return customerId > 0 ? $"Customer#{customerId}" : null;
    }
}

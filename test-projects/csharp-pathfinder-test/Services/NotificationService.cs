// Pathfinder test: async call chain.
// Expected tree from SendConfirmationAsync:
//   SendConfirmationAsync
//   ├── BuildEmailBody → FormatOrderSummary
//   ├── SendEmail
//   └── LogNotification

namespace PathfinderTest.Services;

public class NotificationService
{
    public async Task SendConfirmationAsync(int orderId)
    {
        string body = BuildEmailBody(orderId);
        await SendEmail("customer@example.com", body);
        LogNotification(orderId);
    }

    private string BuildEmailBody(int orderId)
    {
        string summary = FormatOrderSummary(orderId);
        return $"Thank you for your order!\n\n{summary}";
    }

    private async Task SendEmail(string to, string body)
    {
        // Leaf: would call an SMTP client in production
        await Task.Delay(10);
        Console.WriteLine($"Email sent to {to}");
    }

    private void LogNotification(int orderId)
    {
        // Leaf: would write to a logging sink
        Console.WriteLine($"Notification logged for order {orderId}");
    }

    private string FormatOrderSummary(int orderId)
    {
        // Leaf: would fetch order details and format them
        return $"Order #{orderId} — 3 items, dispatched within 2 business days.";
    }
}

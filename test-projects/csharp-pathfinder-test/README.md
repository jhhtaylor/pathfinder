# Pathfinder C# Test Project

A plain .NET 8 console app for testing the Pathfinder VS Code extension's
best-effort call hierarchy on languages that don't natively support
`callHierarchy/outgoingCalls` (C#, Ruby, PHP, …).

## Setup

```bash
dotnet restore
dotnet build   # optional — the language server parses symbols without a build
```

Open the folder in VS Code (requires the **C# Dev Kit** extension).

## What to test

| File | Open and click… | Expected call tree |
|---|---|---|
| `Program.cs` | `RunDemoAsync` | → `SetupServices`, `ProcessOrderAsync`, `Fibonacci`, `IsValidEmail`, `DemoLinqCallChain` |
| `Services/OrderService.cs` | `ProcessOrderAsync` | → `ValidateOrder` → `CheckInventory` → `DataService.GetStockLevel` |
| `Services/NotificationService.cs` | `SendConfirmationAsync` | → `BuildEmailBody` → `FormatOrderSummary` |
| `Services/RecursiveService.cs` | `Fibonacci` | → `Fibonacci (recursive)` |
| `Services/RecursiveService.cs` | `FlattenTree` | → `ProcessNode`, `FlattenTree (recursive)` |
| `Functions/OrderFunctions.cs` | `CreateOrderAsync` | → `ParseOrderRequest`, `ProcessOrderAsync` (cross-file), `BuildResponse` |
| `Extensions/StringExtensions.cs` | `DemoLinqCallChain` | → `IsEvenNumber`, `DoubleValue`, `FormatNumber` |

## Generating a debug dump

In VS Code with the extension loaded:

1. Open any `.cs` file in this project.
2. Open the **Pathfinder** panel (sidebar).
3. Run the command **Pathfinder: Debug Dump** from the Command Palette.
4. Share the dump output when reporting issues.

## Notes

- `Functions/OrderFunctions.cs` includes inline stubs for Azure Functions
  types so the project compiles without any NuGet packages.
- All leaf methods have stub implementations; they are intentionally simple
  to keep the focus on call-graph structure.

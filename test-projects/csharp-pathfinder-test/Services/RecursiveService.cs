// Pathfinder test: recursive methods — Pathfinder should show these as
// "(recursive)" nodes rather than expanding infinitely.

namespace PathfinderTest.Services;

public class RecursiveService
{
    // Direct recursion
    public int Fibonacci(int n)
    {
        if (n <= 1) return n;
        return Fibonacci(n - 1) + Fibonacci(n - 2);
    }

    // Direct recursion
    public long Factorial(int n)
    {
        if (n <= 1) return 1;
        return n * Factorial(n - 1);
    }

    // Indirect recursion via a helper, plus a non-recursive call
    public List<string> FlattenTree(TreeNode node)
    {
        var results = new List<string>();
        results.Add(ProcessNode(node));
        foreach (var child in node.Children)
        {
            results.AddRange(FlattenTree(child));
        }
        return results;
    }

    private string ProcessNode(TreeNode node)
    {
        // Leaf: formats the node for display
        return $"[{node.Name}]";
    }
}

public class TreeNode(string name)
{
    public string Name { get; } = name;
    public List<TreeNode> Children { get; } = [];
}

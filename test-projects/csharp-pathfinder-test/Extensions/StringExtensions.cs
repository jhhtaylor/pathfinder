// Pathfinder test: extension methods + LINQ lambdas.
// Open this file and verify:
// - TruncateWithEllipsis expands to GetTruncationPoint
// - ToTitleCase expands to CapitaliseWord (via LINQ Select lambda)
// - DemoLinqCallChain expands to IsEvenNumber, DoubleValue, FormatNumber

using System.Text.RegularExpressions;

namespace PathfinderTest.Extensions;

public static class StringExtensions
{
    public static string TruncateWithEllipsis(this string s, int maxLen)
    {
        if (s.Length <= maxLen) return s;
        int cut = GetTruncationPoint(s, maxLen);
        return s[..cut] + "…";
    }

    public static string ToTitleCase(this string s)
    {
        return string.Join(" ", s.Split(' ').Select(w => CapitaliseWord(w)));
    }

    public static bool IsValidEmail(this string s)
    {
        // Leaf: simple RFC-5321 check
        return Regex.IsMatch(s, @"^[^@\s]+@[^@\s]+\.[^@\s]+$");
    }

    private static int GetTruncationPoint(string s, int maxLen)
    {
        // Leaf: find last word boundary before maxLen
        int boundary = s.LastIndexOf(' ', maxLen);
        return boundary > 0 ? boundary : maxLen;
    }

    private static string CapitaliseWord(string word)
    {
        // Leaf: upper-cases the first letter
        if (string.IsNullOrEmpty(word)) return word;
        return char.ToUpperInvariant(word[0]) + word[1..].ToLowerInvariant();
    }
}

// ── Lambda / LINQ patterns ─────────────────────────────────────────────────────

public class LambdaExamples
{
    // Expected tree:
    //   DemoLinqCallChain
    //   ├── IsEvenNumber  (lambda passed to Where)
    //   ├── DoubleValue   (lambda passed to Select)
    //   └── FormatNumber  (lambda passed to Select)
    public IEnumerable<string> DemoLinqCallChain(IEnumerable<int> numbers)
    {
        return numbers
            .Where(n => IsEvenNumber(n))
            .Select(n => DoubleValue(n))
            .Select(n => FormatNumber(n));
    }

    // Delegate example — shows that method-group delegates also appear as calls
    public Func<int, bool> GetEvenPredicate()
    {
        return IsEvenNumber;
    }

    private bool IsEvenNumber(int n) => n % 2 == 0;

    private int DoubleValue(int n) => n * 2;

    private string FormatNumber(int n) => $"#{n:D4}";
}

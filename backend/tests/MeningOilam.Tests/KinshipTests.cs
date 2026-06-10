using MeningOilam.Application.Common;
using MeningOilam.Application.Kinship;
using MeningOilam.Domain.Enums;

namespace MeningOilam.Tests;

public class KinshipTests
{
    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid B = Guid.NewGuid();
    private static readonly Guid C = Guid.NewGuid();

    [Fact]
    public void DirectRelationship_IsLabeled()
    {
        // edge (A,B,father) means "B is father to A" → from A to B is father
        var edges = new[] { new EdgeRow(A, B, "father") };
        var r = KinshipCalculator.Calculate(edges, A, B);
        Assert.True(r.Found);
        Assert.Equal("father", r.Type);
    }

    [Fact]
    public void Inverse_IsComputed()
    {
        var edges = new[] { new EdgeRow(A, B, "father") };
        // from B to A: A is son to B
        var r = KinshipCalculator.Calculate(edges, B, A);
        Assert.True(r.Found);
        Assert.Equal("son", r.Type);
    }

    [Fact]
    public void Composition_FatherFather_IsGrandfather()
    {
        // B is father to A, C is father to B  ⇒ from A to C is grandfather
        var edges = new[] { new EdgeRow(A, B, "father"), new EdgeRow(B, C, "father") };
        var r = KinshipCalculator.Calculate(edges, A, C);
        Assert.True(r.Found);
        Assert.Equal("grandfather", r.Type);
    }

    [Fact]
    public void Unrelated_ReturnsNotFound()
    {
        var edges = new[] { new EdgeRow(A, B, "father") };
        var r = KinshipCalculator.Calculate(edges, A, Guid.NewGuid());
        Assert.False(r.Found);
    }

    [Fact]
    public void SamePerson_IsSelf()
    {
        var r = KinshipCalculator.Calculate(Array.Empty<EdgeRow>(), A, A);
        Assert.True(r.Found);
    }
}

public class NamingTests
{
    [Theory]
    [InlineData("AwaitingRelativeChoice", "awaiting_relative_choice")]
    [InlineData("MediaOnly", "media_only")]
    [InlineData("UnclePaternal", "uncle_paternal")]
    [InlineData("Superadmin", "superadmin")]
    [InlineData("GreatGrandfather", "great_grandfather")]
    public void ToSnake_MatchesPostgresLabels(string input, string expected)
    {
        Assert.Equal(expected, Naming.ToSnake(input));
    }

    [Fact]
    public void EnumToSnake_Works()
    {
        Assert.Equal("father_in_law", Naming.ToSnake(RelationshipType.FatherInLaw));
        Assert.Equal("awaiting_admin_approval", Naming.ToSnake(JoinRequestStatus.AwaitingAdminApproval));
    }
}

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using MeningOilam.Domain.Entities;
using MeningOilam.Infrastructure.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace MeningOilam.Infrastructure.Auth;

public class JwtTokenService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _o = options.Value;

    public (string token, long expiresIn) CreateAccessToken(AppUser user, string topRole, Guid? familyId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_o.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTimeOffset.UtcNow;
        var exp = now.AddMinutes(_o.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new("role", topRole),
        };
        if (familyId is not null) claims.Add(new("family_id", familyId.ToString()!));

        var jwt = new JwtSecurityToken(
            issuer: _o.Issuer,
            audience: _o.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: exp.UtcDateTime,
            signingCredentials: creds);

        var token = new JwtSecurityTokenHandler().WriteToken(jwt);
        return (token, (long)(exp - now).TotalSeconds);
    }

    public (string raw, string hash, DateTimeOffset expires) CreateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(48);
        var raw = Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
        return (raw, Hash(raw), DateTimeOffset.UtcNow.AddDays(_o.RefreshTokenDays));
    }

    public static string Hash(string raw)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(bytes);
    }

    public TokenValidationParameters ValidationParameters() => new()
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = _o.Issuer,
        ValidAudience = _o.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_o.Secret)),
        ClockSkew = TimeSpan.FromSeconds(15),
    };
}

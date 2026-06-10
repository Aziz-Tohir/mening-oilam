# ── Build stage ────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore (layer-cached until .csproj files change)
COPY MeningOilam.sln ./
COPY src/MeningOilam.Domain/MeningOilam.Domain.csproj             src/MeningOilam.Domain/
COPY src/MeningOilam.Application/MeningOilam.Application.csproj   src/MeningOilam.Application/
COPY src/MeningOilam.Infrastructure/MeningOilam.Infrastructure.csproj src/MeningOilam.Infrastructure/
COPY src/MeningOilam.Api/MeningOilam.Api.csproj                   src/MeningOilam.Api/
COPY tests/MeningOilam.Tests/MeningOilam.Tests.csproj             tests/MeningOilam.Tests/
RUN dotnet restore

# Build
COPY . .
RUN dotnet publish src/MeningOilam.Api/MeningOilam.Api.csproj \
    -c Release -o /app/publish --no-restore

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Create upload directory
RUN mkdir -p wwwroot/uploads && chmod 777 wwwroot/uploads

COPY --from=build /app/publish .

EXPOSE 5080
ENTRYPOINT ["dotnet", "MeningOilam.Api.dll"]

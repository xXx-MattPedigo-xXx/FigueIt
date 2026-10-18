using System.Text.Json;
using System.Text.Json.Serialization;
using FigueIt.Web.Models;
using Microsoft.JSInterop;

namespace FigueIt.Web.Services;

[JsonSourceGenerationOptions(UseStringEnumConverter = true)]
[JsonSerializable(typeof(AppState))]
internal sealed partial class AppStateJson : JsonSerializerContext;

/// <summary>Saves and loads <see cref="AppState"/> in localStorage. Any failure (blocked storage, bad JSON) is swallowed.</summary>
public sealed class LocalStore(IJSRuntime js)
{
    private const string Key = "figueit.v1";

    public async Task<AppState?> LoadAsync()
    {
        try
        {
            var json = await js.InvokeAsync<string?>("localStorage.getItem", Key);
            if (string.IsNullOrEmpty(json)) return null;
            var state = JsonSerializer.Deserialize(json, AppStateJson.Default.AppState);
            return state is null ? null : Sanitize(state);
        }
        catch (Exception)
        {
            return null;
        }
    }

    public async Task SaveAsync(AppState state)
    {
        try
        {
            var json = JsonSerializer.Serialize(state, AppStateJson.Default.AppState);
            await js.InvokeVoidAsync("localStorage.setItem", Key, json);
        }
        catch (Exception)
        {
            // storage is a convenience; never break the app over it
        }
    }

    // stored data could be hand-edited or from an older version: keep it from crashing the UI
    private static AppState Sanitize(AppState s)
    {
        var d = new AppState();
        if (!Enum.IsDefined(s.Kind)) s.Kind = d.Kind;
        if (!Enum.IsDefined(s.Pattern)) s.Pattern = d.Pattern;
        s.Points ??= [];
        if (s.Points.Count < 3) s.Closed = false;
        foreach (var p in s.Points)
            if (!double.IsFinite(p.X) || !double.IsFinite(p.Y)) { s.Points = []; s.Closed = false; break; }
        if (!double.IsFinite(s.Rotation)) s.Rotation = d.Rotation;
        if (!double.IsFinite(s.OffsetX)) s.OffsetX = d.OffsetX;
        if (!double.IsFinite(s.OffsetY)) s.OffsetY = d.OffsetY;
        if (!double.IsFinite(s.WastePercent)) s.WastePercent = d.WastePercent;
        return s;
    }
}

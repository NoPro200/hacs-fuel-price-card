# Fuel Price Card

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card for displaying fuel prices from multiple gas stations. Shows live prices with trend arrows, supports automatic cheapest-first sorting, includes a full visual UI editor, and works with any sensor that provides a numeric fuel price.

---

## Features

| Feature | Description |
|---------|-------------|
| 🏪 Multiple stations | Show any number of gas stations in one card, each with its own title, subtitle, logo and fuel sensors |
| ⛽ Multiple fuel types | Each station supports unlimited fuel sensors (Diesel, Super E5/E10, LPG, CNG, etc.) |
| 📈 Trend arrows | ▲ red = price rising, ▼ green = price falling, ● grey = no change detected — powered by the HA History API |
| ⭐ Sort by price | Optionally sort stations by their lowest fuel price; the cheapest station gets a badge |
| 🖱️ Click for history | Tap any fuel price chip to open the HA more-info dialog with a full history graph |
| 🖊️ Visual UI editor | Full drag-and-drop editor — no YAML required. Sensor dropdown is pre-filtered to fuel-related entities |
| 🖼️ Logo support | Optionally display a station logo from any public image URL |
| 🔁 Backward compatible | Old single-station configs (without `stations:` list) still work |

---

## Requirements

- Home Assistant 2023.x or newer
- The [Recorder integration](https://www.home-assistant.io/integrations/recorder/) must be enabled (it is by default) for trend arrows to work
- One or more sensor entities that provide numeric fuel prices (e.g. from [Tankerkönig](https://www.home-assistant.io/integrations/tankerkoenig/), REST sensors, scrape sensors, or template sensors)

---

## Installation

### Option A — HACS (recommended)

1. Open **HACS** in your Home Assistant sidebar
2. Go to **Frontend**
3. Click the **⋮ menu** (top right) → **Custom repositories**
4. Enter the repository URL: `https://github.com/nopro200/hacs-fuel-price-card`
5. Select category: **Lovelace**
6. Click **Add**
7. Search for **Fuel Price Card** in the HACS frontend store and click **Install**
8. Hard-reload your browser (**Ctrl+Shift+R** / **Cmd+Shift+R**)

### Option B — Manual installation

1. Download `fuel-price-card.js` from the [latest release](https://github.com/NoPro200/hacs-fuel-price-card/releases/latest)
2. Copy the file to your Home Assistant config folder: `<config>/www/fuel-price-card.js`
   - If the `www` folder does not exist, create it
3. In Home Assistant go to **Settings → Dashboards → Resources**
4. Click **Add Resource**
   - URL: `/local/fuel-price-card.js?v=1`
   - Resource type: **JavaScript Module**
5. Click **Create**
6. Hard-reload your browser (**Ctrl+Shift+R**)

> **Tip:** When you update the file manually, increment the `?v=` number (e.g. `?v=2`, `?v=3`) to force the browser to load the new version instead of the cached one.

---

## Adding the card to your dashboard

1. Open a dashboard and click **Edit** (pencil icon)
2. Click **Add Card**
3. Scroll down and select **Fuel Price Card**, or search for it by name
4. Configure it using the visual editor or switch to the YAML editor

---

## Configuration

### Via visual UI editor

The card comes with a built-in UI editor. Open the card editor to:

- Toggle "Sort by cheapest price"
- Add, remove, reorder stations (drag ↑↓ arrows or drag the ≡ handle)
- Set station name, subtitle and logo URL
- Add, remove, reorder fuel sensors per station
- Pick sensors from a filtered dropdown (only fuel-related sensors are shown)
- Set a display label per sensor

### Via YAML

Switch to YAML mode in the card editor, or edit your dashboard YAML directly.

#### Minimal example (one station, two fuels)

```yaml
type: custom:fuel-price-card
stations:
  - title: ARAL City Center
    fuels:
      - entity: sensor.aral_diesel
        label: Diesel
      - entity: sensor.aral_super_e10
        label: Super E10
```

#### Full example (two stations, all options)

```yaml
type: custom:fuel-price-card
sort_by_price: true
stations:
  - title: ARAL Kamenzer Bogen 16
    subtitle: Hoyerswerda
    logo_url: https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Aral_Logo.svg/200px-Aral_Logo.svg.png
    fuels:
      - entity: sensor.hoyerswerda_aral_diesel
        label: Diesel
      - entity: sensor.hoyerswerda_aral_super_e5
        label: Super E5
      - entity: sensor.hoyerswerda_aral_super_e10
        label: Super E10
  - title: Sprint Hoyerswerdaer Str. 43b
    subtitle: Hoyerswerda
    fuels:
      - entity: sensor.sprint_hoyerswerdaer_str_43b_diesel
        label: Diesel
      - entity: sensor.sprint_hoyerswerdaer_str_43b_super
        label: Super
      - entity: sensor.sprint_hoyerswerdaer_str_43b_super_e10
        label: Super E10
```

---

## Configuration reference

### Card options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `type` | string | ✅ | — | Must be `custom:fuel-price-card` |
| `stations` | list | ✅ | — | List of gas station objects (see below) |
| `sort_by_price` | boolean | ❌ | `false` | If `true`, stations are sorted by their lowest fuel price. The cheapest station gets a ⭐ badge. Prices update live. |

### Station options

Each entry under `stations:` supports the following keys:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `title` | string | ✅ | The name of the gas station, displayed in bold |
| `subtitle` | string | ❌ | A secondary line below the title, e.g. city or street |
| `logo_url` | string | ❌ | URL to a logo image (PNG, SVG, JPG). Displayed as a 42×42 px thumbnail. Use any publicly accessible URL. |
| `fuels` | list | ✅ | List of fuel sensor objects (see below) |

### Fuel sensor options

Each entry under `fuels:` supports the following keys:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `entity` | string | ✅ | The entity ID of the HA sensor that holds the price, e.g. `sensor.aral_diesel` |
| `label` | string | ❌ | Display name shown on the chip, e.g. `Diesel`, `Super E10`, `LPG`. Falls back to the entity ID if omitted. |

---

## Trend arrows explained

The card uses the **Home Assistant History API** to determine price trends. On first load, it queries the last 30 days of state history for each sensor and searches backwards for the most recent recorded value that differs from the current price.

| Arrow | Color | Meaning |
|-------|-------|---------|
| ▲ | Red `#f44336` | Current price is **higher** than the last recorded change |
| ▼ | Green `#4caf50` | Current price is **lower** than the last recorded change |
| ● | Grey `#8a8a8a` | No different value found in the last 30 days (price has not changed) |

**Notes:**
- On first page load, all arrows show ● (neutral) until the history fetch completes in the background. The card then re-renders automatically.
- If a sensor has no history (e.g. newly created), the arrow stays ●.
- The Recorder integration must be active and retaining data for trends to work. The default retention period in HA is 10 days; you can extend it in your `configuration.yaml`.
- When a price changes while the dashboard is open, the card detects the change and re-fetches the history automatically.

---

## Sensor filter in the UI editor

When picking a sensor in the UI editor, the dropdown is filtered to show only relevant entities. A sensor is included if **at least one** of these conditions is true:

1. The entity ID or friendly name contains a fuel-related keyword:
   `preis`, `price`, `diesel`, `super`, `benzin`, `kraftstoff`, `sprit`, `fuel`, `lpg`, `autogas`, `erdgas`, `cng`, `e10`, `e5`, `vpower`, `ultimate`, `excellium`, `momentum`

2. The current state value is a number between **0.00 and 10.00** (typical fuel price range in €/L)

Only `sensor.*` entities are considered. Sensors already assigned to another fuel slot in the same station are hidden to prevent duplicates.

You can always type any entity ID manually if your sensor doesn't match the filter.

---

## Compatible integrations

The card works with **any sensor** that provides a numeric fuel price as its state. Examples:

- **[Tankerkönig](https://www.home-assistant.io/integrations/tankerkoenig/)** — native HA integration for German fuel prices via the Tankerkönig API. Provides `sensor.*_diesel`, `sensor.*_e5`, `sensor.*_e10` entities automatically.
- **REST sensor** — fetch prices from any JSON API
- **Scrape sensor** — scrape prices from a website
- **Template sensor** — derive or transform prices from other sensors
- **MQTT sensor** — receive prices from an external system

---

## Updating the card

### Via HACS
HACS will notify you when a new version is available. Click **Update** in the HACS Frontend section.

### Manually
1. Download the new `fuel-price-card.js`
2. Replace the file in `<config>/www/`
3. Increment the version query string in **Settings → Dashboards → Resources**: change `/local/fuel-price-card.js?v=1` to `?v=2`
4. Hard-reload the browser

---

## Troubleshooting

**Card not appearing / "Custom element doesn't exist"**
- Make sure the resource is registered under Settings → Dashboards → Resources
- Check that the resource type is **JavaScript Module** (not CSS)
- Hard-reload the browser after adding the resource

**Trend arrows always show ●**
- Open the browser console (F12) and look for `[FPC]` log lines
- `[FPC] history sensor.xxx 0 states` means the History API returned no data — check that Recorder is enabled and the sensor has existed long enough to have history
- Make sure `significant_changes_only` is not filtering out your sensor's changes

**Prices show `-`**
- The entity ID is wrong or the sensor is unavailable — check the entity in Developer Tools → States

**Sensor not visible in the UI editor dropdown**
- The entity ID or friendly name doesn't match any keyword AND the value is outside 0–10
- Type the entity ID manually in the sensor field

---

## License

[MIT License](LICENSE) — free to use, modify and distribute.

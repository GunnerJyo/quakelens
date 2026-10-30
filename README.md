# QuakeLens — Earth, in motion

Explore recent earthquakes around the world through an interactive map. QuakeLens combines the **USGS Earthquake GeoJSON feeds** with **MapLibre GL JS** and **Amazon Location Service** to make seismic activity easier to explore.

<p align="center">
  <strong>Live app:</strong> <a href="https://d2ksx722i7d9l2.cloudfront.net/">https://d2ksx722i7d9l2.cloudfront.net/</a>
</p>

QuakeLens was built for the **AWS Builder Center Weekend Challenge: Map it** (October 30 – November 2, 2026).

## What you can explore

- **Global earthquake map** with clustered markers at lower zoom levels.
- **Three time windows:** past 24 hours, 7 days, and 30 days.
- **Minimum-magnitude filter** to focus on events from a selected magnitude threshold.
- **Magnitude-aware markers:** marker size represents earthquake magnitude.
- **Depth visualization:** marker colours distinguish shallow, intermediate, and deep events.
- **Event details:** select a marker or recent-event entry to inspect its magnitude, place, time, depth, and USGS event page.
- **Summary statistics:** number of events shown, events of magnitude 4.5 and above, and the largest event in the selected results.
- **Manual refresh** to request the latest feed again.

The earthquake catalog is live data, so event counts and the largest event change as USGS updates its feeds.

## Data source

QuakeLens uses the United States Geological Survey (USGS) public Earthquake GeoJSON feeds:

| In-app time window | USGS feed |
|---|---|
| Past 24 hours | [`all_day.geojson`](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson) |
| Past 7 days | [`all_week.geojson`](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson) |
| Past 30 days | [`all_month.geojson`](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson) |

Each GeoJSON feature represents an earthquake event. QuakeLens reads the event's point coordinates and properties such as magnitude, place, event time, and event-detail URL. The depth value is taken from the third coordinate in the GeoJSON point geometry.

**Data is fetched directly from USGS by the visitor's browser.** The application does not copy the earthquake feed into its S3 bucket or maintain a separate earthquake database.

Source documentation: [USGS Earthquake GeoJSON Feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).

## How the map works

[MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) renders the interactive map in the browser. QuakeLens converts the returned USGS GeoJSON features into a map source, then displays individual earthquake points and clusters. The map uses marker size to communicate magnitude and colour to communicate depth band. Selecting an event opens a detail popup and links to the corresponding USGS event page.

**Amazon Location Service** provides the map style and basemap tiles. The application uses a restricted Amazon Location API key for browser map access. If the key is unavailable, the source code has an OpenStreetMap raster-style fallback; the deployed application is configured to use Amazon Location Service.

## AWS architecture

QuakeLens is a static, browser-based application. It does not require an application server or a database.

```text
                         ┌──────────────────────────────┐
                         │        Visitor's browser     │
                         │  HTML · CSS · JavaScript     │
                         │       MapLibre GL JS         │
                         └──────────────┬───────────────┘
                                        │
                    ┌───────────────────┼──────────────────┐
                    │                   │                  │
             Static site files     Earthquake data     Basemap style
                    │                   │                  │
                    ▼                   ▼                  ▼
             Amazon CloudFront       USGS GeoJSON      Amazon Location
                    │                                     Service
                    ▼
             Private Amazon S3
                site bucket
```

| Service / technology | Role in QuakeLens |
|---|---|
| **Amazon S3** | Stores the static website files in a private bucket. |
| **Amazon CloudFront** | Delivers the website over HTTPS. CloudFront accesses the private S3 origin using Origin Access Control (OAC). |
| **Amazon Location Service** | Provides the map style and basemap used by the interactive map. |
| **AWS CloudFormation** | Defines the hosting infrastructure in `infra/template.yaml`. |
| **USGS GeoJSON** | Supplies the live earthquake dataset directly to the browser. |
| **MapLibre GL JS** | Renders the interactive map and earthquake data in the browser. |

### Request flow

1. A visitor opens the CloudFront URL.
2. CloudFront retrieves the static site assets from the private S3 bucket.
3. The browser requests the selected earthquake feed from USGS.
4. MapLibre GL JS displays the earthquake features over the Amazon Location basemap.
5. The visitor can filter the displayed events, zoom into clusters, and open event details.

S3 is used for **website hosting**, not as a copy of the live USGS earthquake dataset.

## Repository structure

```text
quakelens/
├── infra/
│   └── template.yaml          # AWS hosting infrastructure
├── site/
│   ├── index.html             # Application page
│   ├── app.js                 # USGS data, filters, statistics and map logic
│   └── styles.css             # Application styling
├── Deploy-QuakeLens.ps1       # Uploads site, generates runtime config and invalidates CloudFront
├── .gitignore                 # Excludes generated configuration and key files
└── README.md
```

`site/config.js` is generated by the deployment script and is intentionally **not committed**. The `quakelens-create-key.json` and `quakelens-update-key.json` files used when managing the Amazon Location key are also excluded from the public repository.

## Deployment

The infrastructure and Amazon Location key must exist before running the deployment script. The script does not create the CloudFormation stack or the Location key; it deploys the site to the existing resources.

### Prerequisites

- An AWS account with the required services available in `us-east-1`.
- AWS CLI installed and configured with credentials for the target account.
- Windows PowerShell.
- The CloudFormation stack named `quakelens`, created from `infra/template.yaml`, with outputs named `SiteBucketName` and `DistributionId`.
- An Amazon Location API key named `QuakeLensMapKey` in `us-east-1`, permitted to access the intended map resource and restricted to the deployed site's HTTP referrer.

Check that the AWS CLI is using the intended account:

```powershell
aws sts get-caller-identity
```

### Deploy the website

From the repository root, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\Deploy-QuakeLens.ps1
```

The process-level execution-policy change applies only to the current PowerShell session. The deployment script:

1. Reads the S3 bucket and CloudFront distribution IDs from the `quakelens` CloudFormation stack.
2. Retrieves the existing `QuakeLensMapKey` value without printing it.
3. Generates `site/config.js` locally for the browser application.
4. Syncs the `site` folder to the private S3 bucket.
5. Requests a CloudFront invalidation for the updated site.

After the invalidation completes, open the CloudFront URL printed by the script. The public website is already deployed at:

**[Open QuakeLens](https://d2ksx722i7d9l2.cloudfront.net/)**

## Security notes

- **Never commit AWS IAM access keys, secret keys, session tokens, or other AWS credentials.**
- Do not commit `site/config.js` or the key-management JSON files. They are excluded through `.gitignore`.
- The Amazon Location key used by a browser application is visible to visitors as part of normal browser requests. It is a public application key, **not** an AWS IAM credential. Restrict it to the required map actions, intended map resource, and your website's referrer; review usage and billing regularly.
- Do not rely on a referrer restriction as a substitute for limiting key permissions and monitoring usage.
- The S3 bucket is private; CloudFront is the public delivery endpoint.

## Technology stack

- HTML5
- CSS3
- JavaScript (no build step or package manager required)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [USGS Earthquake GeoJSON](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
- Amazon Location Service
- Amazon S3, Amazon CloudFront, and AWS CloudFormation

## Challenge submission checklist

For the AWS Builder Center Weekend Challenge: Map it entry, include:

- The USGS dataset and the information it contains.
- How MapLibre GL JS displays the GeoJSON data and how Amazon Location Service provides the basemap.
- The AWS services used and each service's role.
- The live application URL: [QuakeLens](https://d2ksx722i7d9l2.cloudfront.net/).
- A public demo video shorter than three minutes in the Builder Center submission's **demo** field.

A public source repository is encouraged by the challenge. The demo video link is not included here because it should be added once the video has been published.

## Acknowledgements

- Earthquake data: [United States Geological Survey (USGS)](https://www.usgs.gov/programs/earthquake-hazards).
- Mapping library: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/).
- Basemap: Amazon Location Service. The source also contains an OpenStreetMap fallback; OpenStreetMap data attribution is shown in the application when that fallback is used.

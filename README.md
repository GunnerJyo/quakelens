# QuakeLens

**Earth, in motion.** QuakeLens turns the USGS's live earthquake catalog into an explorable global map. Clustered markers reveal seismic hotspots; marker size represents magnitude and marker color represents depth. Filter the recent catalog by time window and minimum magnitude, then open any event's USGS detail page.

## Run locally

The page loads MapLibre and the USGS feed over the network, so serve the `site` folder over HTTP instead of opening the file directly.

```powershell
cd site
python -m http.server 8000
```

Open <http://localhost:8000>. The open basemap works without AWS credentials. To use Amazon Location Service, open **Map settings**, paste a restricted Amazon Location API key, and select the AWS region where you created it. The key stays in page memory and is not saved to disk or local storage.

## Data and map

- **Dataset:** USGS ComCat recent-earthquake summary GeoJSON. The app uses the official `all_day`, `all_week`, and `all_month` feeds. Each feature includes coordinates, origin time, magnitude, depth, place description, and an event-detail URL.
- **Map rendering:** MapLibre GL JS. With a configured key, the basemap style is served by **Amazon Location Service** (`Standard`, Maps API v2). Without one, an OpenStreetMap raster style provides a usable local preview.
- **AWS hosting path:** **Amazon S3** stores the static app files and **Amazon CloudFront** serves them over HTTPS using Origin Access Control. A ready-to-deploy CloudFormation template is in `infra/template.yaml`.
- **Privacy:** No user accounts, analytics, personal data, or backend are used. The optional Amazon Location API key remains in browser memory; use a key restricted to map reads and the deployment's HTTP referrer.

## Deploy to AWS

Requirements: AWS CLI v2, an AWS account, and permission to create CloudFormation, S3, and CloudFront resources. CloudFront and map requests may incur charges under your account; check current AWS pricing before deployment.

1. In the Amazon Location console, create a map resource and an API key with read access for that map. Restrict the key to the site domain after deployment. Keep the key out of the repository.
2. From this project folder, create the static hosting stack:

   ```powershell
   aws cloudformation deploy --template-file infra/template.yaml --stack-name quakelens --capabilities CAPABILITY_IAM
   ```

3. Read the bucket name and CloudFront distribution ID from the stack outputs, then upload the site:

   ```powershell
   $bucket = (aws cloudformation describe-stacks --stack-name quakelens --query "Stacks[0].Outputs[?OutputKey=='SiteBucketName'].OutputValue | [0]" --output text)
   aws s3 sync site "s3://$bucket/" --delete
   ```

4. Open the `SiteUrl` stack output. In **Map settings**, configure the Amazon Location key and region. Test the key on the deployed domain before recording the demo.
5. If you change the site later, upload again and invalidate CloudFront:

   ```powershell
   $distribution = (aws cloudformation describe-stacks --stack-name quakelens --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue | [0]" --output text)
   aws cloudfront create-invalidation --distribution-id $distribution --paths "/*"
   ```

To remove the demo infrastructure when finished, delete the stack. Empty the S3 bucket first if it contains objects; removal can otherwise fail. Do not put account credentials or an unrestricted map key in source control.

## Project structure

```text
site/                 Static single-page map app
infra/template.yaml   Private S3 origin + CloudFront OAC distribution
submission-draft.md   Challenge write-up and short demo script
```

## Credits

Earthquake data: [U.S. Geological Survey (USGS) Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php). Open basemap tiles: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The Amazon Location Service basemap requires an AWS resource and key supplied by the deployer.

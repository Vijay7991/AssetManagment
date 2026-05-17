# /public/downloads

Static download assets served at `/downloads/*`.

## assethub.apk

The web app links the "Download Android app" buttons (sidebar + Settings page) to `/downloads/assethub.apk`. Drop the latest production APK in this folder with that exact filename so the buttons trigger an instant download.

### How to refresh the APK

1. Build the Android app on Expo:
   ```bash
   cd mobile
   eas build --profile production --platform android
   ```
2. From the build page on `expo.dev`, click **Download** to grab the `.apk` file.
3. Rename it to `assethub.apk` and place it here:
   ```
   web/public/downloads/assethub.apk
   ```
4. Commit and deploy. (The file is gitignored by default — see `.gitignore` — push it directly to your hosting platform or include it in your Docker image build context.)

The buttons use the HTML `download` attribute so clicking them downloads the file instantly without navigating away from the page.

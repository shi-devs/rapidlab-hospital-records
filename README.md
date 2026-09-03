# RapidLab — Emergency Laboratory Records

RapidLab is a hospital laboratory record management portal designed for fast data entry during emergency admissions.

## Live Website


## Features

* Staff sign-up with email OTP verification
* Secure email and password login
* Show or hide password controls
* Separate Nurse, Doctor, Administrator and Viewer roles
* Hospital-specific staff and patient data
* Manual entry for 15 common laboratory values
* Upload or scan multiple laboratory reports
* Supports JPG, PNG, WebP and PDF reports
* OCR-assisted extraction from report images
* Save reports even when no laboratory values are extracted
* Automatic team, patient and activity updates
* Doctor and administrator record verification
* Reopen previously uploaded reports
* Delete an individual uploaded report
* Delete a complete patient record with confirmation
* Hospital activity and audit history
* Staff account removal without deleting hospital patient records

## Staff Roles

| Role                | Permissions                               |
| ------------------- | ----------------------------------------- |
| Nurse               | Create, update and manage patient records |
| Doctor / Supervisor | Review and verify clinical records        |
| Hospital Admin      | Manage staff access and verify records    |
| Viewer              | Read-only access to hospital records      |

## Technology

* React
* TypeScript
* Vinext
* Cloudflare Workers
* Cloudflare D1
* Cloudflare R2
* Drizzle ORM
* Tesseract.js OCR

## Run Locally

Install the required packages:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Security

Patient records are separated by hospital workspace. Server-side authorization checks protect every record, report and administrative action.

Do not commit API keys, passwords, patient information or `.env` files to GitHub.

## Important Notice

RapidLab is currently an educational prototype. It is not certified for real clinical use and should not store real patient information without appropriate security, privacy, regulatory and hospital approvals.

## Author

Created by [shi-devs](https://github.com/shi-devs)

# Gender Classification API

A lightweight serverless REST API that classifies a given name by gender using the [Genderize.io](https://genderize.io) external API. Built with Node.js and deployed on Vercel.

---

## Features

- Classifies names by gender with probability scoring
- Computes confidence rating based on probability and sample size
- Handles missing, empty, and invalid query parameters
- Graceful upstream error handling (network failures, bad responses)
- CORS enabled for cross-origin access
- Fully serverless — deployed on Vercel

---

## Tech Stack

- **Runtime:** Node.js 18+
- **Platform:** Vercel Serverless Functions
- **External API:** [Genderize.io](https://genderize.io)
- **HTTP Client:** Native `fetch` (no dependencies)

---

## API Endpoint

### `GET /api/classify`

Classifies a name by gender.

#### Query Parameters

| Parameter | Type   | Required | Description          |
|-----------|--------|----------|----------------------|
| `name`    | string | Yes      | The name to classify |

---

## Request Example

```http
GET /api/classify?name=John
Host: gender-api-hng-v1na.vercel.app
```

---

## Response Examples

### Success `200`

```json
{
  "status": "success",
  "data": {
    "name": "John",
    "gender": "male",
    "probability": 0.99,
    "sample_size": 1458986,
    "is_confident": true,
    "processed_at": "2026-04-11T09:50:42Z"
  }
}
```

### Edge Case — No Prediction Available `200`

Returned when the name has no gender data or zero samples.

```json
{
  "status": "error",
  "message": "No prediction available for the provided name"
}
```

### Missing or Empty Name `400`

```json
{
  "status": "error",
  "message": "Query parameter 'name' is required and cannot be empty"
}
```

### Invalid Parameter Type `422`

```json
{
  "status": "error",
  "message": "Query parameter 'name' must be a string"
}
```

### Upstream API Failure `502`

```json
{
  "status": "error",
  "message": "Upstream API returned an error: 500"
}
```

### Internal Server Error `500`

```json
{
  "status": "error",
  "message": "Failed to reach the upstream API"
}
```

---

## Response Fields

| Field          | Type    | Description                                              |
|----------------|---------|----------------------------------------------------------|
| `name`         | string  | The name that was classified                             |
| `gender`       | string  | `"male"` or `"female"`                                   |
| `probability`  | number  | Probability score between 0 and 1                        |
| `sample_size`  | number  | Number of samples used for the prediction                |
| `is_confident` | boolean | `true` if probability ≥ 0.7 AND sample_size ≥ 100       |
| `processed_at` | string  | UTC timestamp of when the request was processed (ISO 8601)|

---

## Local Setup

### Prerequisites

- Node.js 18 or higher
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Janka50/Gender-API-HNG.git
cd Gender-API-HNG

# Install dependencies
npm install
```

### Run Locally

```bash
node server.js
```

The server starts on `http://localhost:3000`.

```bash
# Test it
curl "http://localhost:3000/api/classify?name=James"
```

---

## Deployment (Vercel)

This project is deployed as a Vercel Serverless Function via the `/api` directory convention.

### Deploy via CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Deploy via GitHub (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import the `Gender-API-HNG` repository
4. Click **Deploy** — no configuration needed

Every subsequent `git push` to `main` triggers an automatic redeployment.

### Live URL

```
https://gender-api-hng-v1na.vercel.app/api/classify?name={name}
```

---

## Author

**Abubakar Abdullahi Janka**
GitHub: [@Janka50](https://github.com/Janka50)

import { resolveCallback } from '@/lib/goCardless/goCardless'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ref = searchParams.get('ref')
  const callbackId = searchParams.get('callbackId')

  if (!ref || !callbackId) {
    return new NextResponse('Missing ref or callbackId parameter', {
      status: 400,
    })
  }

  // Resolve the pending callback promise
  resolveCallback(callbackId, ref)

  // Return user-friendly HTML response
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GoCardless - Success</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #22c55e;
      margin-bottom: 1rem;
    }
    p {
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Success!</h1>
    <p>Bank connection authorized successfully.</p>
    <p>You can close this window now.</p>
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    },
  )
}

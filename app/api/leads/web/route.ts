import { NextResponse } from 'next/server'

// This is a special debug-only version to capture the incoming request.

// FIX #1: Changed the return type from Promise<any> to a specific, safe type
async function readBody(req: Request): Promise<Record<string, unknown>> {
    try {
        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await req.json();
        }
        if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const body: Record<string, string> = {};
            for (const [key, value] of formData.entries()) {
                body[key] = String(value);
            }
            return body;
        }
        return { error: 'Unsupported content type', contentType };
    } catch (error) {
        console.error("!!! CRITICAL ERROR reading request body:", error);
        return { error: 'Failed to read body', details: (error as Error).message };
    }
}

export async function POST(req: Request) {
  try {
    console.log("--- REQUEST RECEIVED AT API ---");

    const headers = Object.fromEntries(req.headers.entries());
    console.log("REQUEST HEADERS:", JSON.stringify(headers, null, 2));

    const rawBody = await readBody(req);
    console.log("RAW BODY PARSED:", JSON.stringify(rawBody, null, 2));

    console.log("--- DEBUGGING FINISHED ---");

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("!!! CRITICAL ERROR IN POST FUNCTION:", errorMsg);
  }

  return NextResponse.json({ ok: true, message: "Debug request received and logged." });
}

// FIX #2: Added an underscore to the unused 'request' parameter to satisfy the linter
export async function OPTIONS(_request: Request) {
    const headers = new Headers();
    headers.set('Access-control-allow-origin', '*');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { headers });
}
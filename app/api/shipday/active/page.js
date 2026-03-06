import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const SHIPDAY_API_KEY = process.env.SHIPDAY_API_KEY;
    try {
        if (!SHIPDAY_API_KEY) {
            return NextResponse.json({ error: 'Shipday API key not configured' }, { status: 500 });
        }

        // Fetch all active orders directly from Shipday to get live Estimated Delivery Times (Routing Sequence)
        const res = await fetch('https://api.shipday.com/orders', {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${SHIPDAY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch from Shipday' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err) {
        console.error('Shipday GET Active Orders Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
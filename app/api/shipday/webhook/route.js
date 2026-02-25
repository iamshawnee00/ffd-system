import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with Service Role Key for backend overrides
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request) {
    try {
        // 1. SECURITY CHECK: Validate the Token from Shipday
        const shipdayToken = request.headers.get('token');
        const expectedToken = process.env.SHIPDAY_WEBHOOK_TOKEN;

        if (!expectedToken || shipdayToken !== expectedToken) {
            return NextResponse.json({ error: 'Unauthorized: Invalid webhook token' }, { status: 401 });
        }

        const payload = await request.json();
        
        // 2. VALIDATE PAYLOAD
        if (!payload || !payload.order || !payload.order.order_number) {
            return NextResponse.json({ error: 'Invalid payload: Missing order number' }, { status: 400 });
        }

        const doNumber = payload.order.order_number; 
        const shipdayStatus = payload.order_status;

        // 3. MAP RAW SHIPDAY STATUS TO INTERNAL STATUS
        // This ensures the "Order List" in your Canvas accurately shows "Delivered" or "In Transit"
        let internalStatus = 'PENDING';
        const s = String(shipdayStatus).toUpperCase();

        if (s.includes('DELIVERED') || s.includes('COMPLETED') || s.includes('DEPOSITED')) {
            internalStatus = 'DELIVERED';
        } else if (s.includes('TRANSIT') || s.includes('STARTED') || s.includes('PICKED') || s.includes('WAY')) {
            internalStatus = 'IN TRANSIT';
        } else if (s.includes('ASSIGNED') || s.includes('ACCEPTED')) {
            internalStatus = 'ASSIGNED';
        } else if (s.includes('FAILED') || s.includes('CANCELLED') || s.includes('INCOMPLETE')) {
            internalStatus = 'FAILED';
        }

        // 4. UPDATE DATABASE
        // This triggers the Real-time Listener on your frontend "Order List" tab
        const { error } = await supabase
            .from('Orders')
            .update({ Status: internalStatus })
            .eq('DONumber', doNumber);

        if (error) {
            console.error("Database Update Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            message: `Order ${doNumber} auto-updated to ${internalStatus}` 
        });

    } catch (err) {
        console.error('Shipday Webhook Processing Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
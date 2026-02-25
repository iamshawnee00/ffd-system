import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const SHIPDAY_API_KEY = "rcYWeuw04H.hZp9ci8IDz8XDjA0URsP";

export async function POST(request) {
    try {
        if (!SHIPDAY_API_KEY) {
            return NextResponse.json({ error: 'Shipday API key not configured' }, { status: 500 });
        }

        const headers = {
            'Authorization': `Basic ${SHIPDAY_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // 1. Prepare Date Range for Query (Last 48 hours to catch recent completions)
        const endTime = new Date().toISOString();
        const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        // 2. Fetch Completed Orders using the POST /query endpoint
        const completedRes = await fetch('https://api.shipday.com/orders/query', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                startTime,
                endTime,
                orderStatus: 'ALREADY_DELIVERED'
            })
        });

        // 3. Fetch Active Orders (Standard list)
        const activeRes = await fetch('https://api.shipday.com/orders', {
            method: 'GET',
            headers
        });

        const completedOrders = completedRes.ok ? await completedRes.json() : [];
        const activeOrders = activeRes.ok ? await activeRes.json() : [];

        // Combine both lists
        const allShipdayOrders = [...completedOrders, ...activeOrders];
        
        if (allShipdayOrders.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0, message: "No orders found in Shipday range" });
        }

        let updatedCount = 0;
        for (const order of allShipdayOrders) {
            // Note: Query API uses orderNumber, GET API uses orderNumber. Some variants might use order_number.
            const doNumber = order.orderNumber || order.order_number;
            if (!doNumber) continue;

            // Get status string (Query API uses .status, GET API uses .orderStatus.orderState)
            const rawStatus = order.status || order.orderStatus?.orderState || 'PENDING';

            // Execute update in Supabase
            const { error } = await supabase
                .from('Orders')
                .update({ Status: rawStatus.toUpperCase() })
                .eq('DONumber', doNumber);

            if (!error) updatedCount++;
        }

        return NextResponse.json({ 
            success: true, 
            updatedCount,
            message: `Successfully synced ${updatedCount} orders (including completions).`
        });

    } catch (err) {
        console.error('Shipday Sync Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
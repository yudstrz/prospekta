import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    success: true,
    count: 0,
    unreadCount: 0,
    notifications: [],
    replies: []
  });
}

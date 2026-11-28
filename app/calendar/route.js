import { NextResponse } from 'next/server';

export async function GET() {
  const destination = process.env.NEXT_PUBLIC_CALENDAR_URL || 'https://calendar.google.com';
  return NextResponse.redirect(destination, 307);
}

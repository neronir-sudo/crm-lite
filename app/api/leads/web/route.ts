import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Raw = Record<string, unknown>;

type CleanLead = {
  status: 'new';
  full_name: string | null;
  phone: string | null;
  email: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null;
};

type PgErr = { message: string; details: string | null; hint: string | null; code: string | null };

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function pickStr(obj: Raw, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function formDataToObj(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  fd.forEach((val, key) => { if (typeof val === 'string') o[key] = val; });
  return o;
}
function urlEncToObj(txt: string): Record<string, string> {
  const p = new URLSearchParams(txt);
  const o: Record<string, string> = {};
  p.forEach((v, k) => (o[k] = v));
  return o;
}
function errJson(e: unknown): PgErr {
  if (isRec(e)) {
    return {
      message: typeof e.message === 'string' ? e.message : 'Unknown error',
      details: typeof (e as {

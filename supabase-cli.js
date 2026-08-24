#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// טוען .env.local (אם קיים) בלי תלות ב-dotenv - שורות בפורמט KEY=VALUE
const envLocalPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const SUPABASE_URL = 'https://lnflftptzrfuzfecmhho.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4UJaMSQubyVg7h-vD-OwEg_37kBN7Bx';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const usingServiceRole = Boolean(SERVICE_ROLE_KEY);
console.log(usingServiceRole
  ? '🔑 משתמש ב-service_role key (גישה מלאה, עוקף RLS)'
  : 'ℹ️  משתמש ב-anon key (גישה מוגבלת לפי RLS) - להוסיף SUPABASE_SERVICE_ROLE_KEY ל-.env.local לגישה מלאה');

const supabase = createClient(SUPABASE_URL, usingServiceRole ? SERVICE_ROLE_KEY : SUPABASE_ANON_KEY);

const commands = {
  async list(table) {
    console.log(`\n📊 רשימת כל הרשומות מטבלה: ${table}\n`);
    const { data, error } = await supabase.from(table).select('*').limit(10);
    if (error) {
      console.error('❌ שגיאה:', error.message);
      return;
    }
    console.log(JSON.stringify(data, null, 2));
  },

  async count(table) {
    console.log(`\n📈 ספירת רשומות בטבלה: ${table}\n`);
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.error('❌ שגיאה:', error.message);
      return;
    }
    console.log(`סה"כ רשומות: ${count}`);
  },

  async tables() {
    console.log(`\n🗂️ טבלאות זמינות:\n`);
    const tables = [
      'vehicles',
      'profiles',
      'driver_details',
      'documents',
      'compliance_items',
      'departments',
      'notifications'
    ];

    for (const table of tables) {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      console.log(`  • ${table}: ${count} רשומות`);
    }
  },
};

const cmd = process.argv[2];
const table = process.argv[3];

if (cmd === 'tables' || !cmd) {
  commands.tables();
} else if (cmd === 'list' && table) {
  commands.list(table);
} else if (cmd === 'count' && table) {
  commands.count(table);
} else {
  console.log(`
שימוש:
  node supabase-cli.js tables                 - הצג את כל הטבלאות
  node supabase-cli.js list <table>          - הצג רשומות מטבלה
  node supabase-cli.js count <table>         - ספור רשומות בטבלה

דוגמאות:
  node supabase-cli.js list vehicles
  node supabase-cli.js count profiles
  node supabase-cli.js list driver_details
  `);
}

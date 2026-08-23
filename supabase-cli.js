#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://lnflftptzrfuzfecmhho.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4UJaMSQubyVg7h-vD-OwEg_37kBN7Bx';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

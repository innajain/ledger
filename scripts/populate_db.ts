import path from 'path';
import { fileURLToPath } from 'url';
import { create_asset } from '@/server actions/asset/create';
import { create_account } from '@/server actions/account/create';
import { create_purpose_bucket } from '@/server actions/purpose_bucket/create';
import {
  create_asset_trade_transaction,
  create_expense_transaction,
  create_income_transaction,
  create_self_transfer_or_refundable_or_refund_transaction,
} from '@/server actions/transaction/create';
import { create_asset_reallocation_between_purpose_buckets } from '@/server actions/purpose_bucket/asset_reallocation_between_purpose_buckets/create';

const __filename = fileURLToPath(import.meta.url);
const invokedPath = process.argv?.[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath && path.resolve(__filename) === invokedPath) {
  await init();
}

async function init() {
  const { id: money_id } = await create_asset({ name: 'Money', type: 'rupees' });
  const { id: parag_parikh } = await create_asset({ name: 'Parag Parikh Flexi Cap', type: 'mf', code: 'INF879O01027' });
  const { id: hdfc_flexicap } = await create_asset({ name: 'HDFC Flexicap Fund', type: 'mf', code: 'INF179K01UT0' });
  const { id: hdfc_midcap } = await create_asset({ name: 'HDFC Midcap Fund', type: 'mf', code: 'INF179K01XQ0' });
  const { id: bandhan_small_cap } = await create_asset({ name: 'Bandhan Small Cap Fund', type: 'mf', code: 'INF194KB1AL4' });
  const { id: invesco_small_cap } = await create_asset({ name: 'Invesco Small Cap Fund', type: 'mf', code: 'INF205K013T3' });
  const { id: motilal_nasdaq } = await create_asset({ name: 'Motilal NASDAQ 100', type: 'etf', code: 'MON100.NS' });
  const { id: mirae_gold } = await create_asset({ name: 'Mirae Gold ETF', type: 'etf', code: 'GOLDETF.NS' });
  const { id: sundaram_low_duration } = await create_asset({ name: 'Sundaram Low Duration Fund', type: 'mf', code: 'INF173K01FS6' });
  const { id: aditya_birla_liquid } = await create_asset({ name: 'Aditya Birla Liquid Fund', type: 'mf', code: 'INF209K01VA3' });
  const { id: lic_low_duration } = await create_asset({ name: 'LIC Low Duration Fund', type: 'mf', code: 'INF767K01FM8' });
  const { id: hdfc_low_duration } = await create_asset({ name: 'HDFC Low Duration Fund', type: 'mf', code: 'INF179K01VF7' });
  const { id: nippon_ultra_short_term } = await create_asset({ name: 'Nippon Ultra Short Term Fund', type: 'mf', code: 'INF204K01YH3' });

  console.log('Created assets');

  const { id: rent } = await create_purpose_bucket({ name: 'Rent' });
  const { id: my_health_insurance } = await create_purpose_bucket({ name: 'My Health Insurance' });
  const { id: my_life_insurance } = await create_purpose_bucket({ name: 'My Life Insurance' });
  const { id: parents_health_insurance } = await create_purpose_bucket({ name: 'Parents Health Insurance' });
  const { id: mandir_charity } = await create_purpose_bucket({ name: 'Mandir Charity' });
  const { id: human_charity } = await create_purpose_bucket({ name: 'Human Charity' });
  const { id: wifi } = await create_purpose_bucket({ name: 'Wifi' });
  const { id: mobile } = await create_purpose_bucket({ name: 'Mobile Recharge' });
  const { id: electricity } = await create_purpose_bucket({ name: 'Electricity' });
  const { id: dinner_tiffin } = await create_purpose_bucket({ name: 'Dinner Tiffin' });
  const { id: maid } = await create_purpose_bucket({ name: 'Maid' });
  const { id: discretionary } = await create_purpose_bucket({ name: 'Discretionary Expense Money' });
  const { id: brokerage } = await create_purpose_bucket({ name: 'Brokerage' });
  const { id: big_ticket_expenses } = await create_purpose_bucket({ name: 'Big Ticket Expenses' });
  const { id: emergency_fund_bank } = await create_purpose_bucket({ name: 'Emergency Fund (Bank)' });
  const { id: emergency_fund_cash } = await create_purpose_bucket({ name: 'Emergency Fund (Cash)' });
  const { id: send_home_money } = await create_purpose_bucket({ name: 'Send to Home Money' });
  const { id: siddhu_college_money } = await create_purpose_bucket({ name: 'Siddhu College Money' });
  const { id: office_food } = await create_purpose_bucket({ name: 'Office Food' });
  const { id: commute } = await create_purpose_bucket({ name: 'Commute' });
  const { id: surprise_expenses } = await create_purpose_bucket({ name: 'Surprise Expenses' });
  const { id: investments } = await create_purpose_bucket({ name: 'Investments' });
  const { id: security_deposit } = await create_purpose_bucket({ name: 'House Security Deposit' });
  const { id: unallocated } = await create_purpose_bucket({ name: 'Unallocated' });

  console.log('Created purpose buckets');
  const today = '09-11-2025';
  const { id: kotak } = await create_account({
    name: 'Kotak',
    opening_balances: [{ asset_id: money_id, date: today, quantity: 0, allocation_to_purpose_buckets: [] }],
  });
  const { id: pnb } = await create_account({
    name: 'PNB',
    opening_balances: [{ asset_id: money_id, date: today, quantity: 0, allocation_to_purpose_buckets: [] }],
  });
  const { id: sbi } = await create_account({
    name: 'SBI',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 100000,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: emergency_fund_bank, quantity: 100000 }],
      },
    ],
  });
  const { id: cash_at_flat } = await create_account({
    name: 'Cash at flat',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 20000,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: emergency_fund_cash, quantity: 20000 }],
      },
    ],
  });
  const { id: wallet } = await create_account({
    name: 'Wallet',
    opening_balances: [
      { asset_id: money_id, quantity: 90, date: today, allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: 90 }] },
    ],
  });
  const { id: coin_pouch } = await create_account({
    name: 'Coin Pouch',
    opening_balances: [
      { asset_id: money_id, quantity: 171, date: today, allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: 171 }] },
    ],
  });
  const { id: idfc } = await create_account({
    name: 'IDFC',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 0,
        date: today,
        allocation_to_purpose_buckets: [],
      },
    ],
  });
  const { id: bhim_upi_lite } = await create_account({
    name: 'BHIM UPI Lite',
    opening_balances: [
      { asset_id: money_id, date: today, quantity: 967, allocation_to_purpose_buckets: [{ purpose_bucket_id: office_food, quantity: 967 }] },
    ],
  });
  const { id: gpay_upi_lite } = await create_account({
    name: 'Gpay UPI Lite',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 763.91,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: 763.91 }],
      },
    ],
  });
  const { id: aviral } = await create_account({
    name: 'Aviral',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: -47,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: -47 }],
      },
    ],
  });
  const { id: pankaj } = await create_account({
    name: 'Pankaj',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 105.17,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: 105.17 }],
      },
    ],
  });
  const { id: sbi_card } = await create_account({
    name: 'SBI Card',
    opening_balances: [{ asset_id: money_id, quantity: 0, date: today, allocation_to_purpose_buckets: [] }],
  });
  const { id: dhaval } = await create_account({
    name: 'Mr. Dhaval Mehta',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 50000,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: security_deposit, quantity: 50000 }],
      },
    ],
  });
  const { id: ten_rs_notes } = await create_account({
    name: '10rs ke note ki gaddi flat pe',
    opening_balances: [
      { asset_id: money_id, quantity: 800, date: today, allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: 800 }] },
    ],
  });
  const { id: epf } = await create_account({
    name: 'EPF',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 27200,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 27200 }],
      },
    ],
  });
  const { id: misc } = await create_account({
    name: 'Misc. Refundables',
    opening_balances: [{ asset_id: money_id, quantity: 0, date: today, allocation_to_purpose_buckets: [] }],
  });
  const { id: groww_balance } = await create_account({
    name: 'Groww Balance',
    opening_balances: [
      { asset_id: money_id, quantity: 1151.72, date: today, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 1151.72 }] },
    ],
  });
  const { id: iccl } = await create_account({
    name: 'ICCL',
    opening_balances: [{ asset_id: money_id, quantity: 0, date: today, allocation_to_purpose_buckets: [] }],
  });
  const { id: rapido } = await create_account({
    name: 'Rapido Wallet',
    opening_balances: [
      { asset_id: money_id, quantity: 143, date: today, allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: 143 }] },
    ],
  });
  const { id: dmrc } = await create_account({
    name: 'DMRC Virtual Card',
    opening_balances: [
      { asset_id: money_id, quantity: 69, date: today, allocation_to_purpose_buckets: [{ purpose_bucket_id: unallocated, quantity: 69 }] },
    ],
  });

  console.log('Created money accounts');

  const { id: groww_demat } = await create_account({
    name: 'Groww demat',
    opening_balances: [
      {
        asset_id: sundaram_low_duration,
        quantity: 21.156,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: siddhu_college_money, quantity: 21.156 }],
      },
      {
        asset_id: aditya_birla_liquid,
        quantity: 46.231,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: send_home_money, quantity: 46.231 }],
      },
      {
        asset_id: lic_low_duration,
        quantity: 344.205,
        date: today,
        allocation_to_purpose_buckets: [
          { purpose_bucket_id: wifi, quantity: 5.718 },
          { purpose_bucket_id: my_health_insurance, quantity: 50.316 },
          { purpose_bucket_id: my_life_insurance, quantity: 50.316 },
          { purpose_bucket_id: parents_health_insurance, quantity: 128.075 },
          { purpose_bucket_id: brokerage, quantity: 109.78 },
        ],
      },
      {
        asset_id: parag_parikh,
        quantity: 184.861,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 184.861 }],
      },
      {
        asset_id: hdfc_midcap,
        quantity: 78.342,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 78.342 }],
      },
      {
        asset_id: nippon_ultra_short_term,
        quantity: 2.21,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: big_ticket_expenses, quantity: 2.21 }],
      },
      {
        asset_id: hdfc_flexicap,
        quantity: 5.79,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 5.79 }],
      },
      {
        asset_id: bandhan_small_cap,
        quantity: 166.354,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 166.354 }],
      },
      {
        asset_id: invesco_small_cap,
        quantity: 183.637,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 183.637 }],
      },
      {
        asset_id: hdfc_low_duration,
        quantity: 50.13,
        date: today,
        allocation_to_purpose_buckets: [
          { purpose_bucket_id: human_charity, quantity: 25.065 },
          { purpose_bucket_id: mandir_charity, quantity: 25.065 },
        ],
      },
      {
        asset_id: motilal_nasdaq,
        quantity: 73,
        date: today,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 73 }],
      },
      { asset_id: mirae_gold, quantity: 27, date: today, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 27 }] },
    ],
  });

  console.log('Created groww demat account');

  await create_asset_reallocation_between_purpose_buckets({
    asset_id: money_id,
    quantity: 285.29,
    from_purpose_bucket_id: unallocated,
    to_purpose_bucket_id: mobile,
    date: today,
  });
  await create_asset_reallocation_between_purpose_buckets({
    asset_id: money_id,
    quantity: 1600,
    from_purpose_bucket_id: unallocated,
    to_purpose_bucket_id: electricity,
    date: today,
  });
  await create_asset_reallocation_between_purpose_buckets({
    asset_id: money_id,
    quantity: -261.21,
    from_purpose_bucket_id: unallocated,
    to_purpose_bucket_id: discretionary,
    date: today,
  });
  await create_asset_reallocation_between_purpose_buckets({
    asset_id: money_id,
    quantity: 987,
    from_purpose_bucket_id: unallocated,
    to_purpose_bucket_id: commute,
    date: today,
  });
  await create_asset_reallocation_between_purpose_buckets({
    asset_id: money_id,
    quantity: -239,
    from_purpose_bucket_id: unallocated,
    to_purpose_bucket_id: surprise_expenses,
    date: today,
  });

  console.log('Created asset reallocations between purpose buckets');
}

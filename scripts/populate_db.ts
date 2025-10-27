import path from 'path';
import { fileURLToPath } from 'url';
import { create_asset } from '@/server actions/asset/create';
import { create_account } from '@/server actions/account/create';
import { create_purpose_bucket } from '@/server actions/purpose_bucket/create';
import { prisma } from '@/prisma';

const __filename = fileURLToPath(import.meta.url);
const invokedPath = process.argv?.[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath && path.resolve(__filename) === invokedPath) {
  // await init();
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
  const { id: ketto_charity } = await create_purpose_bucket({ name: 'Ketto Charity' });
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

  console.log('Created purpose buckets');

  await create_account({ name: 'Kotak', opening_balances: [] });
  await create_account({ name: 'PNB', opening_balances: [] });
  await create_account({
    name: 'SBI',
    opening_balances: [
      { asset_id: money_id, quantity: 90000, allocation_to_purpose_buckets: [{ purpose_bucket_id: emergency_fund_bank, quantity: 90000 }] },
    ],
  });
  await create_account({
    name: 'Cash at flat',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 50000,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: emergency_fund_cash, quantity: 50000 }],
      },
    ],
  });
  await create_account({
    name: 'Wallet',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 1340,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: discretionary, quantity: 1340 }],
      },
    ],
  });
  await create_account({
    name: 'Coin Pouch',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 206,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: discretionary, quantity: 206 }],
      },
    ],
  });
  await create_account({
    name: '10rs ke note ki gaddi flat pe',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 800,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: discretionary, quantity: 800 }],
      },
    ],
  });
  await create_account({
    name: 'IDFC',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 28500,
        allocation_to_purpose_buckets: [
          { purpose_bucket_id: rent, quantity: 25000 },
          { purpose_bucket_id: maid, quantity: 400 },
          { purpose_bucket_id: electricity, quantity: 1600 },
          { purpose_bucket_id: dinner_tiffin, quantity: 1500 },
        ],
      },
    ],
  });
  await create_account({
    name: 'BHIM UPI Lite',
    opening_balances: [{ asset_id: money_id, quantity: 1714, allocation_to_purpose_buckets: [{ purpose_bucket_id: office_food, quantity: 1714 }] }],
  });
  await create_account({
    name: 'Gpay UPI Lite',
    opening_balances: [
      {
        asset_id: money_id,
        quantity: 3814.56,
        allocation_to_purpose_buckets: [
          { purpose_bucket_id: commute, quantity: 1500 },
          { purpose_bucket_id: discretionary, quantity: 1314.56 },
          { purpose_bucket_id: surprise_expenses, quantity: 1000 },
        ],
      },
    ],
  });
  await create_account({
    name: 'Aviral',
    opening_balances: [
      { asset_id: money_id, quantity: 446.67, allocation_to_purpose_buckets: [{ purpose_bucket_id: discretionary, quantity: 446.67 }] },
    ],
  });
  await create_account({
    name: 'Pankaj',
    opening_balances: [
      { asset_id: money_id, quantity: 292.67, allocation_to_purpose_buckets: [{ purpose_bucket_id: discretionary, quantity: 292.67 }] },
    ],
  });

  console.log('Created money accounts');

  await create_account({
    name: 'Groww demat account',
    opening_balances: [
      {
        asset_id: sundaram_low_duration,
        quantity: 21.156,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: siddhu_college_money, quantity: 21.156 }],
      },
      {
        asset_id: aditya_birla_liquid,
        quantity: 46.231,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: send_home_money, quantity: 46.231 }],
      },
      {
        asset_id: lic_low_duration,
        quantity: 357.905,
        allocation_to_purpose_buckets: [
          { purpose_bucket_id: brokerage, quantity: 109 },
          { purpose_bucket_id: my_health_insurance, quantity: 50 },
          { purpose_bucket_id: my_life_insurance, quantity: 50 },
          { purpose_bucket_id: parents_health_insurance, quantity: 130 },
          { purpose_bucket_id: wifi, quantity: 5.7 },
          { purpose_bucket_id: mobile, quantity: 13.205 },
        ],
      },
      { asset_id: parag_parikh, quantity: 142.305, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 142.305 }] },
      { asset_id: hdfc_midcap, quantity: 61.043, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 61.043 }] },
      {
        asset_id: nippon_ultra_short_term,
        quantity: 2.215,
        allocation_to_purpose_buckets: [{ purpose_bucket_id: big_ticket_expenses, quantity: 2.215 }],
      },
      { asset_id: hdfc_flexicap, quantity: 4.422, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 4.422 }] },
      { asset_id: bandhan_small_cap, quantity: 129.096, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 129.096 }] },
      { asset_id: invesco_small_cap, quantity: 140.458, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 140.458 }] },
      {
        asset_id: hdfc_low_duration,
        quantity: 50.13,
        allocation_to_purpose_buckets: [
          { purpose_bucket_id: mandir_charity, quantity: 25.065 },
          { purpose_bucket_id: investments, quantity: 25.065 },
        ],
      },
      { asset_id: motilal_nasdaq, quantity: 56.0, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 56.0 }] },
      { asset_id: mirae_gold, quantity: 27.0, allocation_to_purpose_buckets: [{ purpose_bucket_id: investments, quantity: 27.0 }] },
    ],
  });

  console.log('Created groww demat account');
}

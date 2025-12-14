import { asset_type } from './generated/prisma/enums';
import { runIntegrityChecks } from './integrity_checker';
import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';

await prisma.$transaction(async prisma => {
  await prisma.transaction.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.asset.deleteMany({});

  const { id: shreyansh } = await prisma.user.upsert({
    where: { username: 'shreyansh' },
    create: { username: 'shreyansh', password_hash: await bcrypt.hash('blinkit', 10) },
    update: {},
  });

  const { id: money } = await prisma.asset.create({ data: { name: 'Money', type: asset_type.rupees, user_id: shreyansh } });
  const { id: cash_notes } = await prisma.asset.create({
    data: { name: 'Cash - Notes', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: cash_coins } = await prisma.asset.create({
    data: { name: 'Cash - Coins', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: digital_money } = await prisma.asset.create({
    data: { name: 'Digital Money', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: refundable_money } = await prisma.asset.create({
    data: { name: 'Refundable Money', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: blocked_money } = await prisma.asset.create({
    data: { name: 'Blocked Money', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });

  const { id: long_term } = await prisma.asset.create({ data: { name: 'Long Term Assets', type: 'rupees', user_id: shreyansh } });
  const { id: long_term_refundable_money } = await prisma.asset.create({
    data: { name: 'Long Term Refundable Money', type: asset_type.rupees, user_id: shreyansh, parent_id: long_term },
  });
  const { id: parag_parikh } = await prisma.asset.create({
    data: { name: 'Parag Parikh Flexi Cap', type: 'mf', ticker: 'INF879O01027', user_id: shreyansh, parent_id: long_term },
  });
  const { id: hdfc_flexicap } = await prisma.asset.create({
    data: { name: 'HDFC Flexicap Fund', type: 'mf', ticker: 'INF179K01UT0', user_id: shreyansh, parent_id: long_term },
  });
  const { id: hdfc_midcap } = await prisma.asset.create({
    data: { name: 'HDFC Midcap Fund', type: 'mf', ticker: 'INF179K01XQ0', user_id: shreyansh, parent_id: long_term },
  });
  const { id: bandhan_small_cap } = await prisma.asset.create({
    data: { name: 'Bandhan Small Cap Fund', type: 'mf', ticker: 'INF194KB1AL4', user_id: shreyansh, parent_id: long_term },
  });
  const { id: invesco_small_cap } = await prisma.asset.create({
    data: { name: 'Invesco Small Cap Fund', type: 'mf', ticker: 'INF205K013T3', user_id: shreyansh, parent_id: long_term },
  });
  const { id: motilal_nasdaq } = await prisma.asset.create({
    data: { name: 'Motilal NASDAQ 100', type: 'etf', ticker: 'MON100.NS', user_id: shreyansh, parent_id: long_term },
  });
  const { id: mirae_gold } = await prisma.asset.create({
    data: { name: 'Mirae Gold ETF', type: 'etf', ticker: 'GOLDETF.NS', user_id: shreyansh, parent_id: long_term },
  });

  const { id: short_term } = await prisma.asset.create({
    data: { name: 'Short Term Assets', type: 'other', user_id: shreyansh },
  });
  const { id: sundaram_low_duration } = await prisma.asset.create({
    data: { name: 'Sundaram Low Duration Fund', type: 'mf', ticker: 'INF173K01FS6', user_id: shreyansh, parent_id: short_term },
  });
  const { id: aditya_birla_liquid } = await prisma.asset.create({
    data: { name: 'Aditya Birla Liquid Fund', type: 'mf', ticker: 'INF209K01VA3', user_id: shreyansh, parent_id: short_term },
  });
  const { id: lic_low_duration } = await prisma.asset.create({
    data: { name: 'LIC Low Duration Fund', type: 'mf', ticker: 'INF767K01FM8', user_id: shreyansh, parent_id: short_term },
  });
  const { id: hdfc_low_duration } = await prisma.asset.create({
    data: { name: 'HDFC Low Duration Fund', type: 'mf', ticker: 'INF179K01VF7', user_id: shreyansh, parent_id: short_term },
  });
  const { id: nippon_ultra_short_term } = await prisma.asset.create({
    data: { name: 'Nippon Ultra Short Term Fund', type: 'mf', ticker: 'INF204K01YH3', user_id: shreyansh, parent_id: short_term },
  });

  const { id: bank } = await prisma.account.create({ data: { name: 'Bank', type: 'real', user_id: shreyansh } });
  const { id: idfc } = await prisma.account.create({ data: { name: 'IDFC', type: 'real', user_id: shreyansh, parent_id: bank } });
  const { id: kotak } = await prisma.account.create({ data: { name: 'Kotak', type: 'real', user_id: shreyansh, parent_id: bank } });
  const { id: sbi } = await prisma.account.create({ data: { name: 'SBI', type: 'real', user_id: shreyansh, parent_id: bank } });
  const { id: pnb } = await prisma.account.create({ data: { name: 'PNB', type: 'real', user_id: shreyansh, parent_id: bank } });

  const { id: upi_lite } = await prisma.account.create({ data: { name: 'UPI Lite', type: 'real', user_id: shreyansh } });
  const { id: bhim } = await prisma.account.create({ data: { name: 'BHIM', type: 'real', user_id: shreyansh, parent_id: upi_lite } });
  const { id: google_pay } = await prisma.account.create({ data: { name: 'Google Pay', type: 'real', user_id: shreyansh, parent_id: upi_lite } });
  const { id: super_money } = await prisma.account.create({ data: { name: 'Super Money', type: 'real', user_id: shreyansh, parent_id: upi_lite } });

  const { id: cash_accounts } = await prisma.account.create({ data: { name: 'Cash Accounts', type: 'real', user_id: shreyansh } });
  const { id: cash_at_flat_wardrobe } = await prisma.account.create({
    data: { name: 'Cash at flat wardrobe', type: 'real', user_id: shreyansh, parent_id: cash_accounts },
  });
  const { id: ten_rs } = await prisma.account.create({
    data: { name: '10 rs note packet', type: 'real', user_id: shreyansh, parent_id: cash_accounts },
  });
  const { id: wallet } = await prisma.account.create({ data: { name: 'Wallet', type: 'real', user_id: shreyansh, parent_id: cash_accounts } });
  const { id: coin_pouch } = await prisma.account.create({
    data: { name: 'Coin Pouch', type: 'real', user_id: shreyansh, parent_id: cash_accounts },
  });

  const { id: groww } = await prisma.account.create({ data: { name: 'Groww', type: 'real', user_id: shreyansh } });
  const { id: groww_balance } = await prisma.account.create({ data: { name: 'Groww Balance', type: 'real', user_id: shreyansh, parent_id: groww } });
  const { id: groww_demat } = await prisma.account.create({ data: { name: 'Groww Demat', type: 'real', user_id: shreyansh, parent_id: groww } });
  const { id: groww_mfs } = await prisma.account.create({ data: { name: 'Groww MFs', type: 'real', user_id: shreyansh, parent_id: groww_demat } });
  const { id: groww_etfs_shares } = await prisma.account.create({
    data: { name: 'Groww ETFs & Shares', type: 'real', user_id: shreyansh, parent_id: groww_demat },
  });
  const { id: iccl } = await prisma.account.create({
    data: { name: 'ICCL', type: 'real', user_id: shreyansh, parent_id: groww_demat },
  });

  const { id: people } = await prisma.account.create({ data: { name: 'People', type: 'real', user_id: shreyansh } });
  const { id: aviral } = await prisma.account.create({ data: { name: 'Aviral', type: 'real', user_id: shreyansh, parent_id: people } });
  const { id: pankaj } = await prisma.account.create({ data: { name: 'Pankaj', type: 'real', user_id: shreyansh, parent_id: people } });
  const { id: dhaval } = await prisma.account.create({
    data: { name: 'Mr. Dhaval Mehta', type: 'real', user_id: shreyansh, parent_id: people },
  });
  const { id: others } = await prisma.account.create({ data: { name: 'Others', type: 'real', user_id: shreyansh, parent_id: people } });

  const { id: credit_cards } = await prisma.account.create({ data: { name: 'Credit Cards', type: 'real', user_id: shreyansh } });
  const { id: sbi_card } = await prisma.account.create({ data: { name: 'SBI Card', type: 'real', user_id: shreyansh, parent_id: credit_cards } });
  const { id: axis_card } = await prisma.account.create({ data: { name: 'Axis Card', type: 'real', user_id: shreyansh, parent_id: credit_cards } });

  const { id: app_wallets } = await prisma.account.create({ data: { name: 'App Wallets', type: 'real', user_id: shreyansh } });
  const { id: dmrc_wallet } = await prisma.account.create({
    data: { name: 'DMRC Virtual Card', type: 'real', user_id: shreyansh, parent_id: app_wallets },
  });
  const { id: rapido_wallet } = await prisma.account.create({
    data: { name: 'Rapido Wallet', type: 'real', user_id: shreyansh, parent_id: app_wallets },
  });

  const { id: epf } = await prisma.account.create({ data: { name: 'EPF', type: 'real', user_id: shreyansh } });
  const { id: supermoney_rewards } = await prisma.account.create({
    data: { name: 'Supermoney Unredeemed Rewards', type: 'real', user_id: shreyansh },
  });
  const { id: supercard_uncredited_cashbacks } = await prisma.account.create({
    data: { name: 'Supercard Uncredited Cashbacks', type: 'real', user_id: shreyansh },
  });

  const { id: opening_balance } = await prisma.account.create({ data: { name: 'Opening Balance', type: 'nominal', user_id: shreyansh } });

  const { id: income } = await prisma.account.create({ data: { name: 'Income', type: 'nominal', user_id: shreyansh } });
  const { id: salary } = await prisma.account.create({ data: { name: 'Salary', type: 'nominal', user_id: shreyansh, parent_id: income } });
  const { id: cashbacks } = await prisma.account.create({ data: { name: 'Cashbacks', type: 'nominal', user_id: shreyansh, parent_id: income } });
  const { id: expenses } = await prisma.account.create({ data: { name: 'Expenses', type: 'nominal', user_id: shreyansh } });
  const { id: trading_acc } = await prisma.account.create({ data: { name: 'Trading Account', type: 'nominal', user_id: shreyansh } });

  const { id: monthly_expenses } = await prisma.account.create({ data: { name: 'Monthly Expenses', type: 'allocation', user_id: shreyansh } });
  const { id: rent } = await prisma.account.create({ data: { name: 'Rent', type: 'allocation', user_id: shreyansh, parent_id: monthly_expenses } });
  const { id: living_expenses } = await prisma.account.create({
    data: { name: 'Living Expenses', type: 'allocation', user_id: shreyansh, parent_id: monthly_expenses },
  });
  const { id: office_food } = await prisma.account.create({
    data: { name: 'Office Food', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: mobile_recharge } = await prisma.account.create({
    data: { name: 'Mobile Recharge', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: electricity } = await prisma.account.create({
    data: { name: 'Electricity', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: dinner_tiffin } = await prisma.account.create({
    data: { name: 'Dinner Tiffin', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: maid } = await prisma.account.create({ data: { name: 'Maid', type: 'allocation', user_id: shreyansh, parent_id: living_expenses } });
  const { id: commute } = await prisma.account.create({
    data: { name: 'Commute', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: discretionary } = await prisma.account.create({
    data: { name: 'Discretionary Expenses', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: weekend } = await prisma.account.create({
    data: { name: 'Discretionary Expenses - Weekend', type: 'allocation', user_id: shreyansh, parent_id: discretionary },
  });
  const { id: subscriptions } = await prisma.account.create({
    data: { name: 'Discretionary Expenses - Subscriptions', type: 'allocation', user_id: shreyansh, parent_id: discretionary },
  });

  const { id: yearly_expenses } = await prisma.account.create({ data: { name: 'Yearly Expenses', type: 'allocation', user_id: shreyansh } });
  const { id: wifi } = await prisma.account.create({ data: { name: 'WiFi', type: 'allocation', user_id: shreyansh, parent_id: yearly_expenses } });
  const { id: insurance } = await prisma.account.create({
    data: { name: 'Insurance', type: 'allocation', user_id: shreyansh, parent_id: yearly_expenses },
  });
  const { id: my_health_insurance } = await prisma.account.create({
    data: { name: 'My Health Insurance', type: 'allocation', user_id: shreyansh, parent_id: insurance },
  });
  const { id: my_life_insurance } = await prisma.account.create({
    data: { name: 'My Life Insurance', type: 'allocation', user_id: shreyansh, parent_id: insurance },
  });
  const { id: parents_life_insurance } = await prisma.account.create({
    data: { name: 'Parents Life Insurance', type: 'allocation', user_id: shreyansh, parent_id: insurance },
  });
  const { id: charity } = await prisma.account.create({
    data: { name: 'Charity', type: 'allocation', user_id: shreyansh, parent_id: yearly_expenses },
  });
  const { id: mandir_charity } = await prisma.account.create({
    data: { name: 'Mandir Charity', type: 'allocation', user_id: shreyansh, parent_id: charity },
  });
  const { id: human_charity } = await prisma.account.create({
    data: { name: 'Human Charity', type: 'allocation', user_id: shreyansh, parent_id: charity },
  });
  const { id: send_to_home } = await prisma.account.create({
    data: { name: 'Send to Home', type: 'allocation', user_id: shreyansh, parent_id: yearly_expenses },
  });
  const { id: siddhu } = await prisma.account.create({
    data: { name: 'Siddhu College Money', type: 'allocation', user_id: shreyansh, parent_id: send_to_home },
  });
  const { id: big_ticket } = await prisma.account.create({
    data: { name: 'Big Ticket Expenses', type: 'allocation', user_id: shreyansh, parent_id: yearly_expenses },
  });
  const { id: rent_brokerage } = await prisma.account.create({
    data: { name: 'Rent Brokerage', type: 'allocation', user_id: shreyansh, parent_id: yearly_expenses },
  });
  const { id: savings_for_surprise } = await prisma.account.create({
    data: { name: 'Savings for Surprise Expenses', type: 'allocation', user_id: shreyansh },
  });

  const { id: buffer_liquid_money } = await prisma.account.create({ data: { name: 'Buffer Liquid Money', type: 'allocation', user_id: shreyansh } });
  const { id: buffer_in_bank } = await prisma.account.create({
    data: { name: 'Buffer in Bank', type: 'allocation', user_id: shreyansh, parent_id: buffer_liquid_money },
  });
  const { id: buffer_in_cash } = await prisma.account.create({
    data: { name: 'Buffer in Cash', type: 'allocation', user_id: shreyansh, parent_id: buffer_liquid_money },
  });

  const { id: investments } = await prisma.account.create({ data: { name: 'Investments', type: 'allocation', user_id: shreyansh } });
  const { id: house_security } = await prisma.account.create({ data: { name: 'House Security Deposit', type: 'allocation', user_id: shreyansh } });
  const { id: phantom } = await prisma.account.create({ data: { name: 'Phantom Allocation', type: 'allocation', user_id: shreyansh } });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances',
      datetime: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: 39538.17 },
          { account_id: kotak, asset_id: money, quantity: 83576.5 },
          { account_id: bhim, asset_id: money, quantity: 1922.5 },
          { account_id: super_money, asset_id: money, quantity: 3866.03 },
          { account_id: ten_rs, asset_id: money, quantity: 700 },
          { account_id: wallet, asset_id: money, quantity: 370 },
          { account_id: coin_pouch, asset_id: money, quantity: 166 },
          { account_id: aviral, asset_id: money, quantity: 117.85 },
          { account_id: pankaj, asset_id: money, quantity: -176.32 },
          { account_id: sbi_card, asset_id: money, quantity: -5041 },
          { account_id: axis_card, asset_id: money, quantity: -152 },
          { account_id: dmrc_wallet, asset_id: money, quantity: 69 },
          { account_id: rapido_wallet, asset_id: money, quantity: 143 },
          { account_id: supercard_uncredited_cashbacks, asset_id: money, quantity: 4.56 },
          { account_id: supermoney_rewards, asset_id: money, quantity: 10.35 },

          { account_id: opening_balance, asset_id: money, quantity: 125114.64 },

          { account_id: rent, asset_id: money, quantity: 25000 },
          { account_id: office_food, asset_id: money, quantity: 2300 },
          { account_id: dinner_tiffin, asset_id: money, quantity: 1500 },
          { account_id: dinner_tiffin, asset_id: money, quantity: 1500, description: 'pichle mahine ka allocation' },
          { account_id: commute, asset_id: money, quantity: 600 },
          { account_id: electricity, asset_id: money, quantity: 2600 },
          { account_id: maid, asset_id: money, quantity: 400 },
          { account_id: weekend, asset_id: money, quantity: 2500 },
          { account_id: discretionary, asset_id: money, quantity: 1000 },
          { account_id: subscriptions, asset_id: money, quantity: 200 },
          { account_id: mobile_recharge, asset_id: money, quantity: 285, description: 'pichle mahine ka allocation' },
          { account_id: mobile_recharge, asset_id: money, quantity: 570 },
          { account_id: mandir_charity, asset_id: money, quantity: 625 },
          { account_id: human_charity, asset_id: money, quantity: 625 },
          { account_id: my_health_insurance, asset_id: money, quantity: 1100 },
          { account_id: my_life_insurance, asset_id: money, quantity: 1100 },
          { account_id: parents_life_insurance, asset_id: money, quantity: 3000 },
          { account_id: savings_for_surprise, asset_id: money, quantity: 5000 },
          { account_id: wifi, asset_id: money, quantity: 250 },
          { account_id: rent_brokerage, asset_id: money, quantity: 2400 },
          { account_id: big_ticket, asset_id: money, quantity: 5000 },
          { account_id: send_to_home, asset_id: money, quantity: 5000 },
          { account_id: siddhu, asset_id: money, quantity: 40000 },
          { account_id: investments, asset_id: money, quantity: 22559.64 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances of Buffers',
      datetime: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: money, quantity: 100000 },
          { account_id: cash_at_flat_wardrobe, asset_id: money, quantity: 10000 },

          { account_id: opening_balance, asset_id: money, quantity: 110000 },

          { account_id: buffer_in_bank, asset_id: money, quantity: 100000 },
          { account_id: buffer_in_cash, asset_id: money, quantity: 10000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances of Investments',
      datetime: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: groww_balance, asset_id: money, quantity: 80.18 },
          {
            account_id: groww_mfs,
            asset_id: parag_parikh,
            quantity: 11.848,
            book_value: 999.95,
            datetime: new Date(2025, 3, 11),
            description: 'nav 84.3987',
          },
          {
            account_id: groww_mfs,
            asset_id: parag_parikh,
            quantity: 11.168,
            book_value: 999.95,
            datetime: new Date(2025, 4, 12),
            description: 'nav 89.5367',
          },
          {
            account_id: groww_mfs,
            asset_id: parag_parikh,
            quantity: 54.43,
            book_value: 4999.75,
            datetime: new Date(2025, 5, 9),
            description: 'nav 91.8572',
          },
          {
            account_id: groww_mfs,
            asset_id: parag_parikh,
            quantity: 54.312,
            book_value: 4999.75,
            datetime: new Date(2025, 6, 25),
            description: 'nav 92.0559',
          },
          {
            account_id: groww_mfs,
            asset_id: parag_parikh,
            quantity: 10.547,
            book_value: 999.95,
            datetime: new Date(2025, 9, 20),
            description: 'nav 94.8065',
          },
          {
            account_id: groww_mfs,
            asset_id: parag_parikh,
            quantity: 42.556,
            book_value: 3980.8,
            datetime: new Date(2025, 10, 7),
            description: 'nav 93.5428',
          },
          {
            account_id: groww_mfs,
            asset_id: hdfc_flexicap,
            quantity: 2.739,
            book_value: 6020.7,
            datetime: new Date(2025, 8, 26),
            description: 'nav 2198.255',
          },
          {
            account_id: groww_mfs,
            asset_id: hdfc_flexicap,
            quantity: 1.683,
            book_value: 3819.81,
            datetime: new Date(2025, 9, 20),
            description: 'nav 2270.299',
          },
          {
            account_id: groww_mfs,
            asset_id: hdfc_flexicap,
            quantity: 1.368,
            book_value: 3071.85,
            datetime: new Date(2025, 10, 7),
            description: 'nav 2245.314',
          },
          {
            account_id: groww_mfs,
            asset_id: hdfc_midcap,
            quantity: 38.205,
            book_value: 8028.6,
            datetime: new Date(2025, 8, 26),
            description: 'nav 210.143',
          },
          {
            account_id: groww_mfs,
            asset_id: hdfc_midcap,
            quantity: 22.838,
            book_value: 5025.75,
            datetime: new Date(2025, 9, 20),
            description: 'nav 220.059',
          },
          {
            account_id: groww_mfs,
            asset_id: hdfc_midcap,
            quantity: 17.299,
            book_value: 3832.81,
            datetime: new Date(2025, 10, 7),
            description: 'nav 221.567',
          },
          {
            account_id: groww_mfs,
            asset_id: bandhan_small_cap,
            quantity: 97,
            book_value: 4999.75,
            datetime: new Date(2025, 6, 11),
            description: 'nav 51.544',
          },
          {
            account_id: groww_mfs,
            asset_id: bandhan_small_cap,
            quantity: 32.096,
            book_value: 1662.92,
            datetime: new Date(2025, 9, 20),
            description: 'nav 51.811',
          },
          {
            account_id: groww_mfs,
            asset_id: bandhan_small_cap,
            quantity: 37.258,
            book_value: 1944.9,
            datetime: new Date(2025, 10, 7),
            description: 'nav 52.201',
          },
          {
            account_id: groww_mfs,
            asset_id: invesco_small_cap,
            quantity: 88.644,
            book_value: 4013.8,
            datetime: new Date(2025, 8, 26),
            description: 'nav 45.28',
          },
          {
            account_id: groww_mfs,
            asset_id: invesco_small_cap,
            quantity: 51.814,
            book_value: 2467.88,
            datetime: new Date(2025, 9, 20),
            description: 'nav 47.63',
          },
          {
            account_id: groww_mfs,
            asset_id: invesco_small_cap,
            quantity: 43.179,
            book_value: 2038.9,
            datetime: new Date(2025, 10, 7),
            description: 'nav 47.22',
          },
          {
            account_id: groww_etfs_shares,
            asset_id: motilal_nasdaq,
            quantity: 38,
            book_value: 8097.04,
            datetime: new Date(2025, 8, 26),
            description: 'price 213.08',
          },
          {
            account_id: groww_etfs_shares,
            asset_id: motilal_nasdaq,
            quantity: 18,
            book_value: 4296.06,
            datetime: new Date(2025, 9, 20),
            description: 'price 238.67',
          },
          {
            account_id: groww_etfs_shares,
            asset_id: motilal_nasdaq,
            quantity: 17,
            book_value: 3971.2,
            datetime: new Date(2025, 10, 7),
            description: 'price 233.6',
          },
          {
            account_id: groww_etfs_shares,
            asset_id: mirae_gold,
            quantity: 18,
            book_value: 1997.82,
            datetime: new Date(2025, 8, 26),
            description: 'price 110.99',
          },
          {
            account_id: groww_etfs_shares,
            asset_id: mirae_gold,
            quantity: 9,
            book_value: 1113.12,
            datetime: new Date(2025, 9, 20),
            description: 'price 123.68',
          },
          {
            account_id: groww_etfs_shares,
            asset_id: mirae_gold,
            quantity: 9,
            book_value: 1065.6,
            datetime: new Date(2025, 10, 7),
            description: 'price 118.4',
          },
          { account_id: epf, asset_id: long_term, quantity: 13600, datetime: new Date(2025, 8, 25) },
          { account_id: epf, asset_id: long_term, quantity: 13600, datetime: new Date(2025, 9, 17) },
          { account_id: epf, asset_id: long_term, quantity: 13600, datetime: new Date(2025, 10, 25) },

          { account_id: opening_balance, asset_id: money, quantity: 80.18 },
          { account_id: opening_balance, asset_id: parag_parikh, quantity: 184.861, book_value: 16980.15 },
          { account_id: opening_balance, asset_id: hdfc_flexicap, quantity: 5.79, book_value: 12912.36 },
          { account_id: opening_balance, asset_id: hdfc_midcap, quantity: 78.342, book_value: 16887.16 },
          { account_id: opening_balance, asset_id: bandhan_small_cap, quantity: 166.354, book_value: 8607.57 },
          { account_id: opening_balance, asset_id: invesco_small_cap, quantity: 183.637, book_value: 8520.58 },
          { account_id: opening_balance, asset_id: motilal_nasdaq, quantity: 73, book_value: 16364.3 },
          { account_id: opening_balance, asset_id: mirae_gold, quantity: 36, book_value: 4176.54 },
          { account_id: opening_balance, asset_id: long_term, quantity: 40800 },

          { account_id: investments, asset_id: money, quantity: 80.18 },
          { account_id: investments, asset_id: parag_parikh, quantity: 184.861, book_value: 16980.15 },
          { account_id: investments, asset_id: hdfc_flexicap, quantity: 5.79, book_value: 12912.36 },
          { account_id: investments, asset_id: hdfc_midcap, quantity: 78.342, book_value: 16887.16 },
          { account_id: investments, asset_id: bandhan_small_cap, quantity: 166.354, book_value: 8607.57 },
          { account_id: investments, asset_id: invesco_small_cap, quantity: 183.637, book_value: 8520.58 },
          { account_id: investments, asset_id: motilal_nasdaq, quantity: 73, book_value: 16364.3 },
          { account_id: investments, asset_id: mirae_gold, quantity: 36, book_value: 4176.54 },
          { account_id: investments, asset_id: long_term, quantity: 40800 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances of Short Term Allocations',
      datetime: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: groww_mfs, asset_id: sundaram_low_duration, quantity: 10.604, book_value: 39998, datetime: new Date(2025, 8, 26, 0, 0), description: 'nav 3772.0192' },
          { account_id: groww_mfs, asset_id: sundaram_low_duration, quantity: 10.552, book_value: 39998, datetime: new Date(2025, 9, 20, 0, 0), description: 'nav 3790.6804' },
          { account_id: groww_mfs, asset_id: aditya_birla_liquid, quantity: 23.157, book_value: 9999.5, datetime: new Date(2025, 8, 28, 0, 0), description: 'nav 431.8222' },
          { account_id: groww_mfs, asset_id: aditya_birla_liquid, quantity: 23.074, book_value: 9999.5, datetime: new Date(2025, 9, 19, 0, 0), description: 'nav 433.3633' },
          { account_id: groww_mfs, asset_id: hdfc_low_duration, quantity: 25.131, book_value: 1599.92, datetime: new Date(2025, 8, 26, 0, 0), description: 'nav 63.6632' },
          { account_id: groww_mfs, asset_id: hdfc_low_duration, quantity: 24.999, book_value: 1599.92, datetime: new Date(2025, 9, 20, 0, 0), description: 'nav 63.9985' },
          { account_id: groww_mfs, asset_id: nippon_ultra_short_term, quantity: 1.108, book_value: 4999.75, datetime: new Date(2025, 8, 28, 0, 0), description: 'nav 4514.4113' },
          { account_id: groww_mfs, asset_id: nippon_ultra_short_term, quantity: 1.102, book_value: 4999.75, datetime: new Date(2025, 9, 20, 0, 0), description: 'nav 4535.7166' },
          { account_id: groww_mfs, asset_id: lic_low_duration, quantity: 169.557, book_value: 7404.63, datetime: new Date(2025, 9, 3, 0, 0), description: 'nav 43.6704' },
          { account_id: groww_mfs, asset_id: lic_low_duration, quantity: 188.348, book_value: 8249.59, datetime: new Date(2025, 9, 20, 0, 0), description: 'nav 43.7998' },
          { account_id: groww_mfs, asset_id: lic_low_duration, quantity: -0.035, book_value: -1.53, datetime: new Date(2025, 10, 6, 0, 0), description: 'nav 43.9284' },
          { account_id: groww_mfs, asset_id: lic_low_duration, quantity: -13.665, book_value: -596.76, datetime: new Date(2025, 10, 6, 0, 0), description: 'nav 43.9284' },
          
          { account_id: opening_balance, asset_id: sundaram_low_duration, quantity: 21.156, book_value: 79996 },
          { account_id: opening_balance, asset_id: aditya_birla_liquid, quantity: 46.231, book_value: 19999 },
          { account_id: opening_balance, asset_id: lic_low_duration, quantity: 344.205, book_value: 15055.93 },
          { account_id: opening_balance, asset_id: hdfc_low_duration, quantity: 50.13, book_value: 3199.84 },
          { account_id: opening_balance, asset_id: nippon_ultra_short_term, quantity: 2.21, book_value: 9999.5 },

          { account_id: siddhu, asset_id: sundaram_low_duration, quantity: 21.156, book_value: 79996 },
          { account_id: send_to_home, asset_id: aditya_birla_liquid, quantity: 46.231, book_value: 19999 },
          { account_id: yearly_expenses, asset_id: lic_low_duration, quantity: 344.205, book_value: 15055.93 },
          { account_id: mandir_charity, asset_id: hdfc_low_duration, quantity: 25.065, book_value: 1599.92 },
          { account_id: human_charity, asset_id: hdfc_low_duration, quantity: 25.065, book_value: 1599.92 },
          { account_id: big_ticket, asset_id: nippon_ultra_short_term, quantity: 2.21, book_value: 9999.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balance of House Security Deposit',
      datetime: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: dhaval, asset_id: money, quantity: 50000 },
          { account_id: opening_balance, asset_id: money, quantity: 50000 },
          { account_id: house_security, asset_id: money, quantity: 50000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Momos from swiggy on sick leave',
      datetime: new Date(2025, 11, 1, 9, 35),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -198 },
          { account_id: expenses, asset_id: money, quantity: -198 },
          { account_id: discretionary, asset_id: money, quantity: -198 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zepto',
      datetime: new Date(2025, 11, 1, 15, 40),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -225 },
          { account_id: expenses, asset_id: money, quantity: -89, description: 'maggie' },
          { account_id: expenses, asset_id: money, quantity: -19, description: 'chips' },
          { account_id: expenses, asset_id: money, quantity: -39, description: 'tedhe medhe' },
          { account_id: expenses, asset_id: money, quantity: -46, description: 'dal biji' },
          { account_id: expenses, asset_id: money, quantity: -32, description: 'oreo' },
          { account_id: discretionary, asset_id: money, quantity: -225 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: "refund. aviral's balance cleared",
      datetime: new Date(2025, 11, 1, 19, 49),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: money, quantity: +117.85 },
          { account_id: aviral, asset_id: money, quantity: -117.85 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'biryani from swiggy',
      datetime: new Date(2025, 11, 1, 22, 23),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -139 },
          { account_id: expenses, asset_id: money, quantity: -139 },
          { account_id: discretionary, asset_id: money, quantity: -139 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'mobile repair',
      datetime: new Date(2025, 11, 1, 23, 1),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -2000 },
          { account_id: expenses, asset_id: money, quantity: -2000 },
          { account_id: savings_for_surprise, asset_id: money, quantity: -2000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zomato chole bhature',
      datetime: new Date(2025, 11, 2, 16, 31),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: money, quantity: -486.2 },
          { account_id: supercard_uncredited_cashbacks, asset_id: money, quantity: +14.586 },

          { account_id: expenses, asset_id: money, quantity: -486.2 },
          { account_id: cashbacks, asset_id: money, quantity: +14.586 },

          { account_id: discretionary, asset_id: money, quantity: -471.614 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zepto',
      datetime: new Date(2025, 11, 2, 16, 49),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: money, quantity: -113 },
          { account_id: supercard_uncredited_cashbacks, asset_id: money, quantity: +3.39 },

          { account_id: expenses, asset_id: money, quantity: -24, description: 'ice cream' },
          { account_id: expenses, asset_id: money, quantity: -89, description: 'thums up' },
          { account_id: cashbacks, asset_id: money, quantity: +3.39 },

          { account_id: discretionary, asset_id: money, quantity: -109.61 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      datetime: new Date(2025, 11, 3, 14, 53),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: money, quantity: -117.85 },
          { account_id: idfc, asset_id: money, quantity: +117.85 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'auto to office',
      datetime: new Date(2025, 11, 3, 9, 52),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: pankaj, asset_id: money, quantity: -33.33 },
          { account_id: expenses, asset_id: money, quantity: -33.33 },
          { account_id: commute, asset_id: money, quantity: -33.33 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'breakfast',
      datetime: new Date(2025, 11, 3, 10, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -36.5 },
          { account_id: idfc, asset_id: money, quantity: +2 },

          { account_id: expenses, asset_id: money, quantity: -36.5 },
          { account_id: cashbacks, asset_id: money, quantity: +2 },

          { account_id: office_food, asset_id: money, quantity: -34.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zepto in office. lipbalm and vick inhaler',
      datetime: new Date(2025, 11, 3, 12, 29),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: money, quantity: -132 },
          { account_id: supercard_uncredited_cashbacks, asset_id: money, quantity: +3.96 },

          { account_id: expenses, asset_id: money, quantity: -132 },
          { account_id: cashbacks, asset_id: money, quantity: +3.96 },

          { account_id: discretionary, asset_id: money, quantity: -128.04 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'credit card payment',
      datetime: new Date(2025, 11, 3, 12, 31),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -5041 },
          { account_id: sbi_card, asset_id: money, quantity: +5041 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'lunch',
      datetime: new Date(2025, 11, 3, 14, 12),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -50 },
          { account_id: expenses, asset_id: money, quantity: -50 },
          { account_id: office_food, asset_id: money, quantity: -50 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'evening snacks',
      datetime: new Date(2025, 11, 3, 18, 15),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -29 },
          { account_id: expenses, asset_id: money, quantity: -29 },
          { account_id: office_food, asset_id: money, quantity: -29 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro from office',
      datetime: new Date(2025, 11, 3, 18, 51),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: super_money, asset_id: money, quantity: -10 },
          { account_id: supermoney_rewards, asset_id: money, quantity: +0.15 },

          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: cashbacks, asset_id: money, quantity: +0.15 },

          { account_id: commute, asset_id: money, quantity: -9.85 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'tiffin payment for november',
      datetime: new Date(2025, 11, 3, 20, 3),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -4760 },
          { account_id: pankaj, asset_id: money, quantity: +1586.67 },
          { account_id: aviral, asset_id: money, quantity: +1586.67 },
          { account_id: aviral, asset_id: money, quantity: -1586.67, datetime: new Date(2025, 11, 4, 12, 38) },
          { account_id: sbi, asset_id: money, quantity: +1586.67, datetime: new Date(2025, 11, 4, 12, 38) },

          { account_id: expenses, asset_id: money, quantity: -1586.66 },

          { account_id: dinner_tiffin, asset_id: money, quantity: -1586.66 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Upendra sir birthday cake',
      datetime: new Date(2025, 11, 3, 20, 32),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -48 },
          { account_id: expenses, asset_id: money, quantity: -48 },
          { account_id: discretionary, asset_id: money, quantity: -48 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'buying ipo',
      datetime: new Date(2025, 11, 3, 21, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: money, quantity: -14976, description: 'vidya wires' },
          { account_id: sbi, asset_id: money, quantity: -14985, description: 'meesho' },
          { account_id: sbi, asset_id: money, quantity: -14880, description: 'aequs' },
          { account_id: sbi, asset_id: blocked_money, quantity: 14976, description: 'vidya wires' },
          { account_id: sbi, asset_id: blocked_money, quantity: 14985, description: 'meesho' },
          { account_id: sbi, asset_id: blocked_money, quantity: 14880, description: 'aequs' },
          { account_id: sbi, asset_id: blocked_money, quantity: -44841, datetime: new Date(2025, 11, 9, 0, 0) },
          { account_id: sbi, asset_id: money, quantity: 44841, datetime: new Date(2025, 11, 9, 0, 0) },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'buying mfs/etfs',
      datetime: new Date(2025, 11, 3, 21, 22),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: kotak, asset_id: money, quantity: -81080 },
          { account_id: iccl, asset_id: money, quantity: +81080 },
          { account_id: idfc, asset_id: money, quantity: -3163.5 },
          { account_id: kotak, asset_id: money, quantity: 3163.5 },
          { account_id: kotak, asset_id: money, quantity: -80 },
          { account_id: idfc, asset_id: money, quantity: +80 },
          { account_id: kotak, asset_id: money, quantity: -5580 },
          { account_id: groww_balance, asset_id: money, quantity: +5580 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'allotment of mfs/etfs for investment',
      datetime: new Date(2025, 11, 4, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: iccl, asset_id: money, quantity: -16980 },
          { account_id: groww_balance, asset_id: money, quantity: -5621.57 },
          { account_id: groww_mfs, asset_id: parag_parikh, quantity: 47.688, book_value: 4527.77, description: 'nav 94.946' },
          { account_id: groww_mfs, asset_id: hdfc_flexicap, quantity: 1.493, book_value: 3395.83, description: 'nav 2273.845' },
          { account_id: groww_mfs, asset_id: hdfc_midcap, quantity: 20.189, book_value: 4527.77, description: 'nav 224.265' },
          { account_id: groww_mfs, asset_id: bandhan_small_cap, quantity: 44.272, book_value: 2263.89, description: 'nav 51.136' },
          { account_id: groww_mfs, asset_id: invesco_small_cap, quantity: 48.291, book_value: 2263.89, description: 'nav 46.88' },
          { account_id: groww_etfs_shares, asset_id: motilal_nasdaq, quantity: 19, book_value: 4484, description: 'price 236' },
          { account_id: groww_etfs_shares, asset_id: mirae_gold, quantity: 9, book_value: 1124.55, description: 'price 124.95' },

          { account_id: expenses, asset_id: money, quantity: -0.23, description: 'stamp duty on parag parikh' },
          { account_id: expenses, asset_id: money, quantity: -0.17, description: 'stamp duty on hdfc flexi' },
          { account_id: expenses, asset_id: money, quantity: -0.23, description: 'stamp duty on hdfc midcap' },
          { account_id: expenses, asset_id: money, quantity: -0.11, description: 'stamp duty on bandhan small cap' },
          { account_id: expenses, asset_id: money, quantity: -0.11, description: 'stamp duty on invesco small cap' },
          { account_id: expenses, asset_id: money, quantity: -10, description: 'brokerage on etf' },
          { account_id: expenses, asset_id: money, quantity: -0.17, description: 'exchange transaction charges on etf' },
          { account_id: expenses, asset_id: money, quantity: -0.01, description: 'ipft charges on etf' },
          { account_id: expenses, asset_id: money, quantity: -0.01, description: 'sebi turnover fees for etf' },
          { account_id: expenses, asset_id: money, quantity: -1, description: 'stamp duty on etf' },
          { account_id: expenses, asset_id: money, quantity: -1.83, description: 'gst on etf charges' },

          { account_id: trading_acc, asset_id: money, quantity: -22587.7 },
          { account_id: trading_acc, asset_id: parag_parikh, quantity: 47.688, book_value: 4527.77 },
          { account_id: trading_acc, asset_id: hdfc_flexicap, quantity: 1.493, book_value: 3395.83 },
          { account_id: trading_acc, asset_id: hdfc_midcap, quantity: 20.189, book_value: 4527.77 },
          { account_id: trading_acc, asset_id: bandhan_small_cap, quantity: 44.272, book_value: 2263.89 },
          { account_id: trading_acc, asset_id: invesco_small_cap, quantity: 48.291, book_value: 2263.89 },
          { account_id: trading_acc, asset_id: motilal_nasdaq, quantity: 19, book_value: 4484 },
          { account_id: trading_acc, asset_id: mirae_gold, quantity: 9, book_value: 1124.55 },

          { account_id: investments, asset_id: money, quantity: -22601.57 },
          { account_id: investments, asset_id: parag_parikh, quantity: 47.688, book_value: 4527.77 },
          { account_id: investments, asset_id: hdfc_flexicap, quantity: 1.493, book_value: 3395.83 },
          { account_id: investments, asset_id: hdfc_midcap, quantity: 20.189, book_value: 4527.77 },
          { account_id: investments, asset_id: bandhan_small_cap, quantity: 44.272, book_value: 2263.89 },
          { account_id: investments, asset_id: invesco_small_cap, quantity: 48.291, book_value: 2263.89 },
          { account_id: investments, asset_id: motilal_nasdaq, quantity: 19, book_value: 4484 },
          { account_id: investments, asset_id: mirae_gold, quantity: 9, book_value: 1124.55 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'allotment correction of mfs/etfs for short term allocation',
      datetime: new Date(2025, 11, 4, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: iccl, asset_id: money, quantity: -64100 },
          { account_id: groww_mfs, asset_id: aditya_birla_liquid, quantity: 11.455, book_value: 4999.75, description: 'nav 436.4803' },
          { account_id: groww_mfs, asset_id: lic_low_duration, quantity: 404.556, book_value: 17849.11, description: 'nav 44.1202' },
          { account_id: groww_mfs, asset_id: sundaram_low_duration, quantity: 10.476, book_value: 39998, description: 'nav 3817.9689' },
          { account_id: groww_mfs, asset_id: hdfc_low_duration, quantity: 19.376, book_value: 1249.94, description: 'nav 64.5093' },

          { account_id: expenses, asset_id: money, quantity: -0.25, description: 'stamp duty on aditya birla liquid' },
          { account_id: expenses, asset_id: money, quantity: -0.89, description: 'stamp duty on lic low duration' },
          { account_id: expenses, asset_id: money, quantity: -2, description: 'stamp duty on sundaram low duration' },
          { account_id: expenses, asset_id: money, quantity: -0.06, description: 'stamp duty on hdfc low duration' },
          { account_id: trading_acc, asset_id: money, quantity: -64096.8 },
          { account_id: trading_acc, asset_id: aditya_birla_liquid, quantity: 11.455, book_value: 4999.75 },
          { account_id: trading_acc, asset_id: lic_low_duration, quantity: 404.556, book_value: 17849.11 },
          { account_id: trading_acc, asset_id: sundaram_low_duration, quantity: 10.476, book_value: 39998 },
          { account_id: trading_acc, asset_id: hdfc_low_duration, quantity: 19.376, book_value: 1249.94 },

          { account_id: siddhu, asset_id: money, quantity: -40000 },
          { account_id: siddhu, asset_id: sundaram_low_duration, quantity: 10.476, book_value: 39998 },
          { account_id: mandir_charity, asset_id: money, quantity: -625 },
          { account_id: mandir_charity, asset_id: hdfc_low_duration, quantity: 9.688, book_value: 624.97 },
          { account_id: human_charity, asset_id: money, quantity: -625 },
          { account_id: human_charity, asset_id: hdfc_low_duration, quantity: 9.688, book_value: 624.97 },
          { account_id: send_to_home, asset_id: money, quantity: -5000 },
          { account_id: send_to_home, asset_id: aditya_birla_liquid, quantity: 11.455, book_value: 4999.75 },

          { account_id: my_health_insurance, asset_id: money, quantity: -1100 },
          { account_id: my_health_insurance, asset_id: lic_low_duration, quantity: 24.931, book_value: 1099.96 },
          { account_id: my_life_insurance, asset_id: money, quantity: -1100 },
          { account_id: my_life_insurance, asset_id: lic_low_duration, quantity: 24.931, book_value: 1099.96 },
          { account_id: parents_life_insurance, asset_id: money, quantity: -3000 },
          { account_id: parents_life_insurance, asset_id: lic_low_duration, quantity: 67.993, book_value: 2999.86 },
          { account_id: savings_for_surprise, asset_id: money, quantity: -5000 },
          { account_id: savings_for_surprise, asset_id: lic_low_duration, quantity: 113.32, book_value: 4999.71 },
          { account_id: wifi, asset_id: money, quantity: -250 },
          { account_id: wifi, asset_id: lic_low_duration, quantity: 5.667, book_value: 250.03 },
          { account_id: rent_brokerage, asset_id: money, quantity: -2400 },
          { account_id: rent_brokerage, asset_id: lic_low_duration, quantity: 54.394, book_value: 2399.88 },
          { account_id: big_ticket, asset_id: money, quantity: -5000 },
          { account_id: big_ticket, asset_id: lic_low_duration, quantity: 113.32, book_value: 4999.71 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'auto to office',
      datetime: new Date(2025, 11, 4, 10, 30),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: pankaj, asset_id: money, quantity: -23.33 },
          { account_id: expenses, asset_id: money, quantity: -23.33 },
          { account_id: commute, asset_id: money, quantity: -23.33 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'breakfast',
      datetime: new Date(2025, 11, 4, 10, 51),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -19 },
          { account_id: idfc, asset_id: money, quantity: +2 },
          { account_id: expenses, asset_id: money, quantity: -19 },
          { account_id: cashbacks, asset_id: money, quantity: +2 },
          { account_id: office_food, asset_id: money, quantity: -17 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'lunch',
      datetime: new Date(2025, 11, 4, 13, 26),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -33.5 },
          { account_id: idfc, asset_id: money, quantity: +3 },
          { account_id: expenses, asset_id: money, quantity: -33.5 },
          { account_id: cashbacks, asset_id: money, quantity: +3 },
          { account_id: office_food, asset_id: money, quantity: -30.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'evening snacks',
      datetime: new Date(2025, 11, 4, 17, 13),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -25 },
          { account_id: expenses, asset_id: money, quantity: -25 },
          { account_id: office_food, asset_id: money, quantity: -25 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro from office',
      datetime: new Date(2025, 11, 4, 19, 1),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: super_money, asset_id: money, quantity: -10 },
          { account_id: supermoney_rewards, asset_id: money, quantity: +0.07 },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: cashbacks, asset_id: money, quantity: +0.07 },
          { account_id: commute, asset_id: money, quantity: -9.93 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'buying protein shake for aviral',
      datetime: new Date(2025, 11, 4, 19, 35),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: money, quantity: -2371 },
          { account_id: supercard_uncredited_cashbacks, asset_id: money, quantity: +71.13 },
          { account_id: sbi, asset_id: money, quantity: 2300 },
          { account_id: aviral, asset_id: money, quantity: -0.13 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro to and from office',
      datetime: new Date(2025, 11, 5, 10, 20),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: super_money, asset_id: money, quantity: -10, description: 'metro from office booked by mistake in the morning' },
          { account_id: idfc, asset_id: money, quantity: -10 },
          { account_id: supermoney_rewards, asset_id: money, quantity: +0.03 },
          { account_id: supermoney_rewards, asset_id: money, quantity: +0.04 },
          { account_id: expenses, asset_id: money, quantity: -20 },
          { account_id: cashbacks, asset_id: money, quantity: +0.07 },
          { account_id: commute, asset_id: money, quantity: -19.93 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'lunch',
      datetime: new Date(2025, 11, 5, 13, 26),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -50 },
          { account_id: idfc, asset_id: money, quantity: +2 },
          { account_id: expenses, asset_id: money, quantity: -50 },
          { account_id: cashbacks, asset_id: money, quantity: +2 },
          { account_id: office_food, asset_id: money, quantity: -48 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'evening snacks',
      datetime: new Date(2025, 11, 5, 18, 17),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -6.5 },
          { account_id: expenses, asset_id: money, quantity: -6.5 },
          { account_id: office_food, asset_id: money, quantity: -6.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'bank transfer for cash for watchman',
      datetime: new Date(2025, 11, 6, 10, 1),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: money, quantity: -5000 },
          { account_id: cash_at_flat_wardrobe, asset_id: money, quantity: +5000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'rent',
      datetime: new Date(2025, 11, 7, 13, 44),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: money, quantity: -25000 },
          { account_id: expenses, asset_id: money, quantity: -25000 },
          { account_id: rent, asset_id: money, quantity: -25000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'movie tickets',
      datetime: new Date(2025, 11, 7, 13, 52),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi_card, asset_id: money, quantity: -423.28 },
          { account_id: aviral, asset_id: money, quantity: +141.09 },
          { account_id: pankaj, asset_id: money, quantity: +141.1 },
          { account_id: expenses, asset_id: money, quantity: -141.09 },
          { account_id: weekend, asset_id: money, quantity: -141.09 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'scrub',
      datetime: new Date(2025, 11, 7, 15, 13),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: aviral, asset_id: money, quantity: -17.33 },
          { account_id: expenses, asset_id: money, quantity: -17.33 },
          { account_id: discretionary, asset_id: money, quantity: -17.33 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'barber',
      datetime: new Date(2025, 11, 7, 16, 32),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: super_money, asset_id: money, quantity: -60 },
          { account_id: supermoney_rewards, asset_id: money, quantity: +0.36 },
          { account_id: expenses, asset_id: money, quantity: -60 },
          { account_id: cashbacks, asset_id: money, quantity: +0.36 },
          { account_id: discretionary, asset_id: money, quantity: -59.64 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'auto to movie',
      datetime: new Date(2025, 11, 7, 17, 36),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: super_money, asset_id: money, quantity: -82 },
          { account_id: pankaj, asset_id: money, quantity: +41 },
          { account_id: expenses, asset_id: money, quantity: -41 },
          { account_id: weekend, asset_id: money, quantity: -41 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro from movie',
      datetime: new Date(2025, 11, 7, 21, 30),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: super_money, asset_id: money, quantity: -10, description: 'refunded' },
          { account_id: idfc, asset_id: money, quantity: -10 },
          { account_id: idfc, asset_id: money, quantity: +10, datetime: new Date(2025, 11, 8, 20, 23) },
          { account_id: supermoney_rewards, asset_id: money, quantity: +0.03 },
          { account_id: supermoney_rewards, asset_id: money, quantity: +0.04 },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: cashbacks, asset_id: money, quantity: +0.07 },
          { account_id: weekend, asset_id: money, quantity: -9.93 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'opening gpay upi lite',
      datetime: new Date(2025, 11, 8, 9, 12),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: 5000 },
          { account_id: idfc, asset_id: money, quantity: -5000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro to office',
      datetime: new Date(2025, 11, 8, 9, 16),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -10 },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: commute, asset_id: money, quantity: -10 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'breakfast',
      datetime: new Date(2025, 11, 8, 9, 45),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -41.5 },
          { account_id: expenses, asset_id: money, quantity: -41.5 },
          { account_id: office_food, asset_id: money, quantity: -41.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'kal aviral ne common samaan mangaya tha',
      datetime: new Date(2025, 11, 8, 11, 10),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: aviral, asset_id: money, quantity: -150 },
          { account_id: expenses, asset_id: money, quantity: -150 },
          { account_id: discretionary, asset_id: money, quantity: -150 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'lunch',
      datetime: new Date(2025, 11, 8, 12, 46),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -39.5 },
          { account_id: expenses, asset_id: money, quantity: -39.5 },
          { account_id: office_food, asset_id: money, quantity: -39.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'evening snacks',
      datetime: new Date(2025, 11, 8, 17, 56),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -21.5 },
          { account_id: idfc, asset_id: money, quantity: +3 },
          { account_id: expenses, asset_id: money, quantity: -21.5 },
          { account_id: cashbacks, asset_id: money, quantity: +3 },
          { account_id: office_food, asset_id: money, quantity: -18.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro from office',
      datetime: new Date(2025, 11, 8, 18, 18),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -10 },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: commute, asset_id: money, quantity: -10 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'maid',
      datetime: new Date(2025, 11, 8, 21, 22),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: cash_at_flat_wardrobe, asset_id: money, quantity: -1000 },
          { account_id: wallet, asset_id: money, quantity: -200 },
          { account_id: aviral, asset_id: money, quantity: +400 },
          { account_id: pankaj, asset_id: money, quantity: +400 },
          { account_id: expenses, asset_id: money, quantity: -400 },
          { account_id: maid, asset_id: money, quantity: -400 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro to office',
      datetime: new Date(2025, 11, 9, 8, 58),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -10 },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: commute, asset_id: money, quantity: -10 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'breakfast',
      datetime: new Date(2025, 11, 9, 10, 25),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -31.5 },
          { account_id: expenses, asset_id: money, quantity: -31.5 },
          { account_id: office_food, asset_id: money, quantity: -31.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'lunch burger',
      datetime: new Date(2025, 11, 9, 15, 28),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -32.5 },
          { account_id: expenses, asset_id: money, quantity: -32.5 },
          { account_id: office_food, asset_id: money, quantity: -32.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'evening snacks',
      datetime: new Date(2025, 11, 9, 17, 44),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -17 },
          { account_id: expenses, asset_id: money, quantity: -17 },
          { account_id: office_food, asset_id: money, quantity: -17 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro from office',
      datetime: new Date(2025, 11, 9, 19, 10),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -10 },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: commute, asset_id: money, quantity: -10 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'deleting supermoney upi lite',
      datetime: new Date(2025, 11, 10, 0, 7),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: super_money, asset_id: money, quantity: -3684.03 },
          { account_id: idfc, asset_id: money, quantity: +3684.03 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'redeeming lic mf 2000 rs for reconciliation of savings allocation',
      datetime: new Date(2025, 11, 10, 0, 17),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: groww_mfs, asset_id: lic_low_duration, quantity: -45.291, book_value: -1977.88 },
          { account_id: kotak, asset_id: money, quantity: 1999.28, datetime: new Date(2025, 11, 11, 10, 3) },

          { account_id: trading_acc, asset_id: lic_low_duration, quantity: -45.291, book_value: -1977.88 },
          { account_id: trading_acc, asset_id: money, quantity: 1977.88 },
          { account_id: income, asset_id: money, quantity: 21.4 },

          { account_id: savings_for_surprise, asset_id: lic_low_duration, quantity: -45.291, book_value: -1977.88 },
          { account_id: savings_for_surprise, asset_id: money, quantity: 1999.28 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'auto to office',
      datetime: new Date(2025, 11, 10, 9, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: pankaj, asset_id: money, quantity: -48.5 },
          { account_id: expenses, asset_id: money, quantity: -48.5 },
          { account_id: commute, asset_id: money, quantity: -48.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'breakfast',
      datetime: new Date(2025, 11, 10, 9, 17),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -56.5 },
          { account_id: idfc, asset_id: money, quantity: +2 },
          { account_id: expenses, asset_id: money, quantity: -56.5 },
          { account_id: cashbacks, asset_id: money, quantity: +2 },
          { account_id: office_food, asset_id: money, quantity: -54.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro from office',
      datetime: new Date(2025, 11, 10, 18, 28),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: money, quantity: -10 },
          { account_id: idfc, asset_id: money, quantity: -10, description: 'refunded' },
          { account_id: google_pay, asset_id: money, quantity: -10, description: 'refunded' },
          { account_id: idfc, asset_id: money, quantity: 10, datetime: new Date(2025, 11, 11, 18, 30) },
          { account_id: idfc, asset_id: money, quantity: 10, datetime: new Date(2025, 11, 11, 18, 33) },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: commute, asset_id: money, quantity: -10 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      datetime: new Date(2025, 11, 10, 18, 34),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: aviral, asset_id: money, quantity: -373.76 },
          { account_id: sbi, asset_id: money, quantity: 373.76 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'kurkure chips',
      datetime: new Date(2025, 11, 10, 18, 44),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -30 },
          { account_id: expenses, asset_id: money, quantity: -30 },
          { account_id: discretionary, asset_id: money, quantity: -30 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zepto',
      datetime: new Date(2025, 11, 10, 19, 7),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -181 },
          { account_id: expenses, asset_id: money, quantity: -92, description: 'colddrink' },
          { account_id: expenses, asset_id: money, quantity: -89, description: 'maggie' },
          { account_id: discretionary, asset_id: money, quantity: -181 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'breakfast',
      datetime: new Date(2025, 11, 11, 9, 38),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -31.5 },
          { account_id: idfc, asset_id: money, quantity: +2 },
          { account_id: expenses, asset_id: money, quantity: -31.5 },
          { account_id: cashbacks, asset_id: money, quantity: +2 },
          { account_id: office_food, asset_id: money, quantity: -29.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'auto to office',
      datetime: new Date(2025, 11, 11, 10, 2),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: pankaj, asset_id: money, quantity: -49 },
          { account_id: expenses, asset_id: money, quantity: -49 },
          { account_id: commute, asset_id: money, quantity: -49 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'lunch',
      datetime: new Date(2025, 11, 11, 13, 39),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -50 },
          { account_id: expenses, asset_id: money, quantity: -50 },
          { account_id: office_food, asset_id: money, quantity: -50 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'lunch',
      datetime: new Date(2025, 11, 11, 17, 47),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: bhim, asset_id: money, quantity: -31.5 },
          { account_id: expenses, asset_id: money, quantity: -31.5 },
          { account_id: office_food, asset_id: money, quantity: -31.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'metro from office',
      datetime: new Date(2025, 11, 11, 18, 7),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -10 },
          { account_id: expenses, asset_id: money, quantity: -10 },
          { account_id: commute, asset_id: money, quantity: -10 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'swiggy 2 burgers',
      datetime: new Date(2025, 11, 12, 12, 51),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: google_pay, asset_id: money, quantity: -181 },
          { account_id: expenses, asset_id: money, quantity: -181 },
          { account_id: discretionary, asset_id: money, quantity: -181 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zomato pasta',
      datetime: new Date(2025, 11, 13, 23, 18),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: money, quantity: -146.91 },
          { account_id: supercard_uncredited_cashbacks, asset_id: money, quantity: +4.41 },
          { account_id: expenses, asset_id: money, quantity: -146.91 },
          { account_id: cashbacks, asset_id: money, quantity: +4.41 },
          { account_id: discretionary, asset_id: money, quantity: -142.5 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zepto',
      datetime: new Date(2025, 11, 14, 20, 33),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: money, quantity: -210 },
          { account_id: supercard_uncredited_cashbacks, asset_id: money, quantity: +6.3 },
          { account_id: expenses, asset_id: money, quantity: -210 },
          { account_id: cashbacks, asset_id: money, quantity: +6.3 },
          { account_id: discretionary, asset_id: money, quantity: -203.7 },
        ],
      },
    },
  });
});

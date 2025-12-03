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
    update: {},
    create: { username: 'shreyansh', password_hash: await bcrypt.hash('blinkit', 10) },
  });

  const { id: money } = await prisma.asset.create({ data: { name: 'Money', type: asset_type.rupees, user_id: shreyansh } });
  const { id: cash } = await prisma.asset.create({
    data: { name: 'Cash - Notes', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: cash_coins } = await prisma.asset.create({
    data: { name: 'Cash - Coins', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: digital_money } = await prisma.asset.create({
    data: { name: 'Digital Money', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: blocked_money } = await prisma.asset.create({
    data: { name: 'Blocked Money', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });
  const { id: liability_money } = await prisma.asset.create({
    data: { name: 'Liability Money', type: asset_type.rupees, user_id: shreyansh, parent_id: money },
  });

  const { id: long_term } = await prisma.asset.create({ data: { name: 'Long Term Assets', type: 'other', user_id: shreyansh } });
  const { id: not_really_money } = await prisma.asset.create({
    data: { name: 'Not Really Money', type: asset_type.rupees, user_id: shreyansh, parent_id: long_term },
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

  const { id: monthly_expenses } = await prisma.account.create({ data: { name: 'Monthly Expenses', type: 'allocation', user_id: shreyansh } });
  const { id: living_expenses } = await prisma.account.create({
    data: { name: 'Living Expenses', type: 'allocation', user_id: shreyansh, parent_id: monthly_expenses },
  });
  const { id: rent } = await prisma.account.create({ data: { name: 'Rent', type: 'allocation', user_id: shreyansh, parent_id: monthly_expenses } });
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
  const { id: weekend } = await prisma.account.create({
    data: { name: 'Discretionary Expenses - Weekend', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: daily_expenses } = await prisma.account.create({
    data: { name: 'Discretionary Expenses - Daily', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: subscriptions } = await prisma.account.create({
    data: { name: 'Discretionary Expenses - Subscriptions', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
  });
  const { id: commute } = await prisma.account.create({
    data: { name: 'Commute', type: 'allocation', user_id: shreyansh, parent_id: living_expenses },
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

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances',
      date: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: digital_money, quantity: 39538.17 },
          { account_id: kotak, asset_id: digital_money, quantity: 83576.5 },
          { account_id: bhim, asset_id: digital_money, quantity: 1922.5 },
          { account_id: super_money, asset_id: digital_money, quantity: 3866.03 },
          { account_id: ten_rs, asset_id: cash, quantity: 700 },
          { account_id: wallet, asset_id: cash, quantity: 370 },
          { account_id: coin_pouch, asset_id: cash_coins, quantity: 166 },
          { account_id: aviral, asset_id: blocked_money, quantity: 117.85 },
          { account_id: pankaj, asset_id: liability_money, quantity: -176.32 },
          { account_id: sbi_card, asset_id: liability_money, quantity: -5041 },
          { account_id: axis_card, asset_id: liability_money, quantity: -152 },
          { account_id: dmrc_wallet, asset_id: blocked_money, quantity: 69 },
          { account_id: rapido_wallet, asset_id: blocked_money, quantity: 143 },
          { account_id: supercard_uncredited_cashbacks, asset_id: blocked_money, quantity: 4.56 },
          { account_id: supermoney_rewards, asset_id: blocked_money, quantity: 10.35 },

          { account_id: opening_balance, asset_id: digital_money, quantity: -128903.2 },
          { account_id: opening_balance, asset_id: cash, quantity: -1070 },
          { account_id: opening_balance, asset_id: cash_coins, quantity: -166 },
          { account_id: opening_balance, asset_id: blocked_money, quantity: -344.76 },
          { account_id: opening_balance, asset_id: liability_money, quantity: 5369.32 },

          { account_id: rent, asset_id: digital_money, quantity: 25000 },
          { account_id: office_food, asset_id: digital_money, quantity: 2300 },
          { account_id: dinner_tiffin, asset_id: digital_money, quantity: 1500 },
          { account_id: dinner_tiffin, asset_id: digital_money, quantity: 1500, description: 'pichle mahine ka allocation' },
          { account_id: commute, asset_id: digital_money, quantity: 600 },
          { account_id: electricity, asset_id: digital_money, quantity: 2600 },
          { account_id: maid, asset_id: cash, quantity: 400 },
          { account_id: weekend, asset_id: digital_money, quantity: 2500 },
          { account_id: daily_expenses, asset_id: digital_money, quantity: 1000 },
          { account_id: subscriptions, asset_id: digital_money, quantity: 200 },
          { account_id: mobile_recharge, asset_id: digital_money, quantity: 285, description: 'pichle mahine ka allocation' },
          { account_id: mobile_recharge, asset_id: digital_money, quantity: 570 },
          { account_id: mandir_charity, asset_id: digital_money, quantity: 625 },
          { account_id: human_charity, asset_id: digital_money, quantity: 625 },
          { account_id: my_health_insurance, asset_id: digital_money, quantity: 1100 },
          { account_id: my_life_insurance, asset_id: digital_money, quantity: 1100 },
          { account_id: parents_life_insurance, asset_id: digital_money, quantity: 3000 },
          { account_id: savings_for_surprise, asset_id: digital_money, quantity: 9188.56 },
          { account_id: savings_for_surprise, asset_id: cash, quantity: 670 },
          { account_id: savings_for_surprise, asset_id: cash_coins, quantity: 166 },
          { account_id: savings_for_surprise, asset_id: blocked_money, quantity: 344.76 },
          { account_id: savings_for_surprise, asset_id: liability_money, quantity: -5369.32 },
          { account_id: wifi, asset_id: digital_money, quantity: 250 },
          { account_id: rent_brokerage, asset_id: digital_money, quantity: 2400 },
          { account_id: big_ticket, asset_id: digital_money, quantity: 5000 },
          { account_id: send_to_home, asset_id: digital_money, quantity: 5000 },
          { account_id: siddhu, asset_id: digital_money, quantity: 40000 },
          { account_id: investments, asset_id: digital_money, quantity: 22559.64 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances of Buffers',
      date: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: digital_money, quantity: 100000 },
          { account_id: cash_at_flat_wardrobe, asset_id: cash, quantity: 10000 },
          { account_id: opening_balance, asset_id: digital_money, quantity: -100000 },
          { account_id: opening_balance, asset_id: cash, quantity: -10000 },
          { account_id: buffer_in_bank, asset_id: digital_money, quantity: 100000 },
          { account_id: buffer_in_cash, asset_id: cash, quantity: 10000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances of Investments',
      date: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: groww_balance, asset_id: blocked_money, quantity: 80.18 },
          { account_id: groww_mfs, asset_id: parag_parikh, quantity: 184.861, book_value: 0 },
          { account_id: groww_mfs, asset_id: hdfc_flexicap, quantity: 5.79, book_value: 0 },
          { account_id: groww_mfs, asset_id: hdfc_midcap, quantity: 78.342, book_value: 0 },
          { account_id: groww_mfs, asset_id: bandhan_small_cap, quantity: 166.354, book_value: 0 },
          { account_id: groww_mfs, asset_id: invesco_small_cap, quantity: 183.637, book_value: 0 },
          { account_id: groww_etfs_shares, asset_id: motilal_nasdaq, quantity: 73, book_value: 0 },
          { account_id: groww_etfs_shares, asset_id: mirae_gold, quantity: 36, book_value: 0 },
          { account_id: epf, asset_id: not_really_money, quantity: 40800 },

          { account_id: opening_balance, asset_id: blocked_money, quantity: -80.18 },
          { account_id: opening_balance, asset_id: parag_parikh, quantity: -184.861, book_value: 0 },
          { account_id: opening_balance, asset_id: hdfc_flexicap, quantity: -5.79, book_value: 0 },
          { account_id: opening_balance, asset_id: hdfc_midcap, quantity: -78.342, book_value: 0 },
          { account_id: opening_balance, asset_id: bandhan_small_cap, quantity: -166.354, book_value: 0 },
          { account_id: opening_balance, asset_id: invesco_small_cap, quantity: -183.637, book_value: 0 },
          { account_id: opening_balance, asset_id: motilal_nasdaq, quantity: -73, book_value: 0 },
          { account_id: opening_balance, asset_id: mirae_gold, quantity: -36, book_value: 0 },
          { account_id: opening_balance, asset_id: not_really_money, quantity: -40800 },

          { account_id: investments, asset_id: blocked_money, quantity: 80.18 },
          { account_id: investments, asset_id: parag_parikh, quantity: 184.861, book_value: 0 },
          { account_id: investments, asset_id: hdfc_flexicap, quantity: 5.79, book_value: 0 },
          { account_id: investments, asset_id: hdfc_midcap, quantity: 78.342, book_value: 0 },
          { account_id: investments, asset_id: bandhan_small_cap, quantity: 166.354, book_value: 0 },
          { account_id: investments, asset_id: invesco_small_cap, quantity: 183.637, book_value: 0 },
          { account_id: investments, asset_id: motilal_nasdaq, quantity: 73, book_value: 0 },
          { account_id: investments, asset_id: mirae_gold, quantity: 36, book_value: 0 },
          { account_id: investments, asset_id: not_really_money, quantity: 40800 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balances of Short Term Allocations',
      date: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: groww_mfs, asset_id: sundaram_low_duration, quantity: 21.156, book_value: 0 },
          { account_id: groww_mfs, asset_id: aditya_birla_liquid, quantity: 46.231, book_value: 0 },
          { account_id: groww_mfs, asset_id: lic_low_duration, quantity: 344.205, book_value: 0 },
          { account_id: groww_mfs, asset_id: hdfc_low_duration, quantity: 50.13, book_value: 0 },
          { account_id: groww_mfs, asset_id: nippon_ultra_short_term, quantity: 2.21, book_value: 0 },

          { account_id: opening_balance, asset_id: sundaram_low_duration, quantity: -21.156, book_value: 0 },
          { account_id: opening_balance, asset_id: aditya_birla_liquid, quantity: -46.231, book_value: 0 },
          { account_id: opening_balance, asset_id: lic_low_duration, quantity: -344.205, book_value: 0 },
          { account_id: opening_balance, asset_id: hdfc_low_duration, quantity: -50.13, book_value: 0 },
          { account_id: opening_balance, asset_id: nippon_ultra_short_term, quantity: -2.21, book_value: 0 },

          { account_id: yearly_expenses, asset_id: sundaram_low_duration, quantity: 21.156, book_value: 0 },
          { account_id: yearly_expenses, asset_id: aditya_birla_liquid, quantity: 46.231, book_value: 0 },
          { account_id: yearly_expenses, asset_id: lic_low_duration, quantity: 344.205, book_value: 0 },
          { account_id: yearly_expenses, asset_id: hdfc_low_duration, quantity: 50.13, book_value: 0 },
          { account_id: yearly_expenses, asset_id: nippon_ultra_short_term, quantity: 2.21, book_value: 0 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Opening Balance of House Security Deposit',
      date: new Date(2025, 11, 1, 0, 0),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: dhaval, asset_id: blocked_money, quantity: 50000 },
          { account_id: opening_balance, asset_id: blocked_money, quantity: -50000 },
          { account_id: house_security, asset_id: blocked_money, quantity: 50000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'Momos from swiggy on sick leave',
      date: new Date(2025, 11, 1, 9, 35),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: digital_money, quantity: -198 },
          { account_id: expenses, asset_id: digital_money, quantity: 198 },
          { account_id: daily_expenses, asset_id: digital_money, quantity: -198 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zepto',
      date: new Date(2025, 11, 1, 3, 40),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: digital_money, quantity: -225 },
          { account_id: expenses, asset_id: digital_money, quantity: 89, description: 'maggie' },
          { account_id: expenses, asset_id: digital_money, quantity: 19, description: 'chips' },
          { account_id: expenses, asset_id: digital_money, quantity: 39, description: 'tedhe medhe' },
          { account_id: expenses, asset_id: digital_money, quantity: 46, description: 'dal biji' },
          { account_id: expenses, asset_id: digital_money, quantity: 32, description: 'oreo' },
          { account_id: daily_expenses, asset_id: digital_money, quantity: -225 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: "refund. aviral's balance cleared",
      date: new Date(2025, 11, 1, 19, 49),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: sbi, asset_id: digital_money, quantity: +117.85 },
          { account_id: aviral, asset_id: blocked_money, quantity: -117.85 },
          { account_id: savings_for_surprise, asset_id: digital_money, quantity: +117.85 },
          { account_id: savings_for_surprise, asset_id: blocked_money, quantity: -117.85 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'biryani from swiggy',
      date: new Date(2025, 11, 1, 22, 23),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: digital_money, quantity: -139 },
          { account_id: expenses, asset_id: digital_money, quantity: 139 },
          { account_id: daily_expenses, asset_id: digital_money, quantity: -139 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'mobile repair',
      date: new Date(2025, 11, 1, 23, 1),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: idfc, asset_id: digital_money, quantity: -2000 },
          { account_id: expenses, asset_id: digital_money, quantity: 2000 },
          { account_id: savings_for_surprise, asset_id: digital_money, quantity: -2000 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zomato chole bhature',
      date: new Date(2025, 11, 2, 16, 31),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: digital_money, quantity: -486.2 },
          { account_id: supercard_uncredited_cashbacks, asset_id: blocked_money, quantity: +14.586 },
          { account_id: expenses, asset_id: digital_money, quantity: 486.2 },
          { account_id: cashbacks, asset_id: blocked_money, quantity: -14.586 },
          { account_id: daily_expenses, asset_id: digital_money, quantity: -486.2 },
          { account_id: daily_expenses, asset_id: blocked_money, quantity: +14.586 },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      description: 'zepto',
      date: new Date(2025, 11, 2, 16, 49),
      user_id: shreyansh,
      line_items: {
        create: [
          { account_id: axis_card, asset_id: digital_money, quantity: -113 },
          { account_id: supercard_uncredited_cashbacks, asset_id: blocked_money, quantity: +3.39 },
          { account_id: expenses, asset_id: digital_money, quantity: 24, description: 'ice cream' },
          { account_id: expenses, asset_id: digital_money, quantity: 89, description: 'thums up' },
          { account_id: cashbacks, asset_id: blocked_money, quantity: -3.39 },
          { account_id: daily_expenses, asset_id: digital_money, quantity: -113 },
          { account_id: daily_expenses, asset_id: blocked_money, quantity: +3.39 },
        ],
      },
    },
  });
});

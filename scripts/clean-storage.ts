import { getAllPortfolios, savePortfolio } from "../lib/storage";
import { deleteCachedData } from "../lib/redis";

async function cleanStoredPortfolios() {
  console.log("=== INSPECTING STORED PORTFOLIOS ===");
  const list = await getAllPortfolios();
  console.log(`Found ${list.length} stored portfolios`);

  for (const p of list) {
    console.log(`Portfolio: "${p.name}" (ID: ${p.id}) - ${p.transactions.length} transactions`);
    // Find if it has synthetic tx-init-cash transactions
    const synthetic = p.transactions.filter(t => t.id.startsWith("tx-init"));
    if (synthetic.length > 0) {
      console.log(`  Cleaning ${synthetic.length} synthetic transactions from "${p.name}"...`);
      p.transactions = p.transactions.filter(t => !t.id.startsWith("tx-init"));
      await savePortfolio(p);
    }
  }

  // Clear Redis cache
  await deleteCachedData("portfolios:all");
  console.log("Cleared Redis portfolio cache!");
}

cleanStoredPortfolios().catch(console.error);

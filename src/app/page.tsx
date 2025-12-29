import { getAccountsWithPendingImports } from './_actions/accounts'
import { getBatches } from './_actions/batches'
import ImportUI from './import-ui'

export default async function Home() {
  const accounts = await getAccountsWithPendingImports()
  const batches = await getBatches()

  return <ImportUI accounts={accounts} batches={batches} />
}

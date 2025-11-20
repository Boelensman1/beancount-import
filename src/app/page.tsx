import { getAccounts, getBatches } from './actions'
import ImportUI from './import-ui'

export default async function Home() {
  const accounts = await getAccounts()
  const batches = await getBatches()

  return <ImportUI accounts={accounts} batches={batches} />
}

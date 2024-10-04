import { CurrencyAmount, TradeType } from '@iguanadex/sdk'
import { V4Router } from '@iguanadex/smart-router'
import { etherlinkTokens } from '@iguanadex/tokens'
import { useCallback, useMemo, useState } from 'react'
import { Chain, createPublicClient, http } from 'viem'

import './App.css'
import { Link } from 'react-router-dom'

const amountToSell = 1
const swapFrom = etherlinkTokens.wxtz
const swapTo = etherlinkTokens.usdc

const etherlink = {
  id: 42_793,
  name: 'Etherlink',
  network: 'etherlink',
  nativeCurrency: {
    decimals: 18,
    name: 'tez',
    symbol: 'XTZ',
  },
  rpcUrls: {
    public: { http: ['https://node.mainnet.etherlink.com'] },
    default: { http: ['https://node.mainnet.etherlink.com'] },
  },
  blockExplorers: {
    etherscan: { name: 'Etherscout', url: 'https://explorer.etherlink.com/' },
    default: { name: 'Etherscout', url: 'https://explorer.etherlink.com/' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 33899,
    },
  },
} as const satisfies Chain

const publicClient = createPublicClient({
  chain: etherlink,
  transport: http(etherlink.rpcUrls.public.http[0]),
  batch: {
    multicall: {
      batchSize: 1024 * 200,
    },
  },
})

export function V4RouterExample() {
  const [trade, setTrade] = useState<Awaited<ReturnType<typeof V4Router.getBestTrade>> | undefined>(undefined)
  const amount = useMemo(() => CurrencyAmount.fromRawAmount(swapFrom, amountToSell * 10 ** swapFrom.decimals), [])
  const getBestRoute = useCallback(async () => {
    const v3Pools = await V4Router.getV3CandidatePools({
      clientProvider: () => publicClient,
      currencyA: swapFrom,
      currencyB: swapTo,
    })
    const pools = [...v3Pools]
    const trade = await V4Router.getBestTrade(amount, swapTo, TradeType.EXACT_INPUT, {
      gasPriceWei: () => publicClient.getGasPrice(),
      candidatePools: pools,
      maxHops: 2,
      maxSplits: 2,
    })
    setTrade(trade)
  }, [amount])

  return (
    <div className="App">
      <p>
        <Link to="/">Back to main menu</Link>
      </p>
      <header className="App-header">
        <p>V4 Router Example.</p>
        <p>
          Get best quote swapping from {amount.toExact()} {amount.currency.symbol} to{' '}
          {trade?.outputAmount.toExact() || '?'} {swapTo.symbol}
        </p>
        <p>
          <button onClick={getBestRoute}>{trade ? 'Update quote' : 'Get Quote'}</button>
        </p>
      </header>
    </div>
  )
}

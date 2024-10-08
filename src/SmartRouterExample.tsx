import { CurrencyAmount, TradeType, Percent } from '@iguanadex/sdk'
import { SMART_ROUTER_ADDRESSES, SmartRouter, SmartRouterTrade, SwapRouter } from '@iguanadex/smart-router'
import { etherlinkTokens } from '@iguanadex/tokens'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  WagmiConfig,
  createConfig,
  useAccount,
  useConnect,
  useSwitchNetwork,
  useNetwork,
  useSendTransaction,
} from 'wagmi'
import { MetaMaskConnector } from 'wagmi/connectors/metaMask'
import { Chain, createPublicClient, hexToBigInt, http } from 'viem'
import { GraphQLClient } from 'graphql-request'

import './App.css'
import { Link } from 'react-router-dom'

//////////////////////// INPUTS ////////////////////////

const amountToSell = 4
const swapFrom = etherlinkTokens.usdt
const swapTo = etherlinkTokens.wxtz

////////////////////////////////////////////////////////

const chainId = 42_793
const BIPS_BASE = 10_000n

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

const config = createConfig({
  autoConnect: true,
  connectors: [new MetaMaskConnector({ chains: [etherlink] })],
  publicClient,
})

const v3SubgraphClient = new GraphQLClient(
  'https://api.studio.thegraph.com/query/69431/exchange-v3-etherlink/version/latest',
)
const v2SubgraphClient = new GraphQLClient(
  'https://api.studio.thegraph.com/query/69431/exchange-v2-etherlink/version/latest',
)

const quoteProvider = SmartRouter.createQuoteProvider({
  onChainProvider: () => publicClient,
})

function calculateGasMargin(value: bigint, margin = 1000n): bigint {
  return (value * (10000n + margin)) / 10000n
}

export function SmartRouterExample() {
  return (
    <WagmiConfig config={config}>
      <Main />
    </WagmiConfig>
  )
}

function Main() {
  const { chain } = useNetwork()
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { switchNetwork } = useSwitchNetwork()
  const { sendTransactionAsync } = useSendTransaction()

  const [trade, setTrade] = useState<SmartRouterTrade<TradeType> | null>(null)
  const amount = useMemo(() => CurrencyAmount.fromRawAmount(swapFrom, amountToSell * 10 ** swapFrom.decimals), [])
  const getBestRoute = useCallback(async () => {
    const [v2Pools, v3Pools] = await Promise.all([
      SmartRouter.getV2CandidatePools({
        onChainProvider: () => publicClient,
        v2SubgraphProvider: () => v2SubgraphClient,
        v3SubgraphProvider: () => v3SubgraphClient,
        currencyA: amount.currency,
        currencyB: swapTo,
      }),
      SmartRouter.getV3CandidatePools({
        onChainProvider: () => publicClient,
        subgraphProvider: () => v3SubgraphClient,
        currencyA: amount.currency,
        currencyB: swapTo,
        subgraphFallback: false,
      }),
    ])
    const pools = [...v2Pools, ...v3Pools]
    const trade = await SmartRouter.getBestTrade(amount, swapTo, TradeType.EXACT_INPUT, {
      gasPriceWei: () => publicClient.getGasPrice(),
      maxHops: 2,
      maxSplits: 2,
      poolProvider: SmartRouter.createStaticPoolProvider(pools),
      quoteProvider,
      quoterOptimization: true,
    })
    setTrade(trade)
  }, [amount])

  const swapCallParams = useMemo(() => {
    if (!trade) {
      return null
    }
    const { value, calldata } = SwapRouter.swapCallParameters(trade, {
      recipient: address,
      slippageTolerance: new Percent(25n, BIPS_BASE), // 0.25% ?
    })
    return {
      address: SMART_ROUTER_ADDRESSES[chainId],
      calldata,
      value,
    }
  }, [trade, address])

  const swap = useCallback(async () => {
    if (!swapCallParams || !address) {
      return
    }

    const { value, calldata, address: routerAddress } = swapCallParams

    const tx = {
      account: address,
      to: routerAddress,
      data: calldata,
      value: hexToBigInt(value),
    }
    const gasEstimate = await publicClient.estimateGas(tx)
    await sendTransactionAsync({
      account: address,
      chainId,
      to: routerAddress,
      data: calldata,
      value: hexToBigInt(value),
      gas: calculateGasMargin(gasEstimate),
    })
  }, [swapCallParams, address, sendTransactionAsync])

  useEffect(() => {
    if (isConnected && chain?.id !== chainId) {
      switchNetwork?.(chainId)
    }
  }, [isConnected, switchNetwork, chain])

  return (
    <div className="App">
      <p>
        <Link to="/">Back to main menu</Link>
      </p>
      <header className="App-header">
        <p>Smart Router Example.</p>
        <p>
          Get best quote swapping from {amount.toExact()} {amount.currency.symbol} to{' '}
          {trade?.outputAmount.toExact() || '?'} {swapTo.symbol}
        </p>
        <p>
          {isConnected ? (
            address
          ) : (
            <button onClick={() => connect({ connector: connectors[0] })}>Connect wallet</button>
          )}
        </p>
        <p>{!trade ? <button onClick={getBestRoute}>Get Quote</button> : <button onClick={swap}>Swap</button>}</p>
      </header>
    </div>
  )
}

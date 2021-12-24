import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import Wallet from "@araviel/safe-wallet-adapter";
import {
  Connection,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  Keypair,
  PublicKey,
  Signer,
} from '@safecoin/web3.js';
import { AccountLayout, NATIVE_MINT, Token, TOKEN_PROGRAM_ID } from '@safecoin/safe-token';
// for instructions who requires a signer (especially account creation) use partialSign(newAccount) >

// todo fetch and display tokens
// catch and trigger if wrapped safe
function toHex(buffer: Buffer) {
  return Array.prototype.map
    .call(buffer, (x: number) => ('00' + x.toString(16)).slice(-2))
    .join('');
}

function App(): React.ReactElement {
  const [logs, setLogs] = useState<string[]>([]);
  function addLog(log: string) {
    setLogs((logs) => [...logs, log]);
  }

  const network = clusterApiUrl('devnet');
  const [providerUrl, setProviderUrl] = useState('https://localhost:3000/');
  const connection = useMemo(() => new Connection(network), [network]);
  const urlWallet = useMemo(
    () => new Wallet(providerUrl, network),
    [providerUrl, network],
  );
  const [selectedWallet, setSelectedWallet] = useState<
    Wallet | undefined | null
  >(undefined);
  const [, setConnected] = useState(false);
  useEffect(() => {
    if (selectedWallet) {
      selectedWallet.on('connect', () => {
        setConnected(true);
        addLog(
          `Connected to wallet ${selectedWallet.publicKey?.toBase58() ?? '--'}`,
        );
      });
      selectedWallet.on('disconnect', () => {
        setConnected(false);
        addLog('Disconnected from wallet');
      });
      void selectedWallet.connect();
      return () => {
        void selectedWallet.disconnect();
      };
    }
  }, [selectedWallet]);

  async function sendTransaction() {
    try {
      const pubkey = selectedWallet?.publicKey;
      if (!pubkey || !selectedWallet) {
        throw new Error('wallet not connected');
      }
      const randomnewwallet = Keypair.generate();
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: pubkey,
          toPubkey: randomnewwallet.publicKey,
          lamports: 100,
        }),
      );
      addLog('Getting recent blockhash');
      transaction.recentBlockhash = (
        await connection.getRecentBlockhash()
      ).blockhash;
      addLog('Sending signature request to wallet');
      transaction.feePayer = pubkey;
      const signed = await selectedWallet.signTransaction(transaction);
      addLog('Got signature, submitting transaction');
      const signature = await connection.sendRawTransaction(signed.serialize());
      addLog('Submitted transaction ' + signature + ', awaiting confirmation');
      await connection.confirmTransaction(signature, 'singleGossip');
      addLog('Transaction ' + signature + ' confirmed');
    } catch (e) {
      console.warn(e);
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  async function signMessage() {
    try {
      if (!selectedWallet) {
        throw new Error('wallet not connected');
      }
      const message =
        'Please sign this message for proof of address ownership.';
      addLog('Sending message signature request to wallet');
      const data = new TextEncoder().encode(message);
      const signed = await selectedWallet.sign(data, 'hex');
      addLog('Got signature: ' + toHex(signed.signature));
    } catch (e) {
      console.warn(e);
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  async function unwrapSafe(
    /* for implementation
    connection: Connection,
    programId: PublicKey,
    owner: PublicKey,
     */
  ) {
    try {
      const mainPubkey = selectedWallet?.publicKey;
      if (!mainPubkey || !selectedWallet) {
        throw new Error('wallet not connected');
      }


      const transac = new Transaction();
      // trigger the unwrap ONLY if there is an account containing Safe111111111111111111111111111111111111112
      // create a loop if there is multiples
      transac.add(
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          new PublicKey('DTZdNDieJg2NvytL8XgRzXX7yuVkB4s19AATfHwBZmZP'),
          mainPubkey,
          mainPubkey,
          []
        )
      );
      transac.recentBlockhash = (
        await connection.getRecentBlockhash()
      ).blockhash;
      transac.feePayer = mainPubkey;
      //transac.partialSign(newAccount)
      const signed = await selectedWallet.signTransaction(transac);
      //signed.serialize()
      //signed.partialSign(newAccount)
      const signature2 = await connection.sendRawTransaction(signed.serialize());
      const confirmation = await connection.confirmTransaction(signature2, 'singleGossip');
      console.log("Confirmation : ", confirmation)
    } catch (e) {
      console.log(`eeeee`, e);
    }
  }

  async function checkWrappedSafe() {

    const pubkey = selectedWallet?.publicKey;
    if (!pubkey || !selectedWallet) {
      throw new Error('wallet not connected');
    }

    const accounts = await connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          {
            dataSize: 165, // number of bytes
          },
          {
            memcmp: {
              offset: 32, // number of bytes
              bytes: pubkey.toBase58(), // base58 encoded string
            },
          },
        ],
      }
    );

    addLog(
      `Found ${accounts.length} token account(s) for wallet ${pubkey}: `
    );
    accounts.forEach((account, i) => {
      const associatedTokenMetadata = account.pubkey.toString();

      if (account.account.data["parsed"]["info"]["mint"] === NATIVE_MINT.toBase58()) {
        console.log("wrapped safe found :", associatedTokenMetadata);
        addLog(
          `-- Wrapped safe AssociatedAcc : ${account.pubkey.toString()} --` +
          `Amount: ${account.account.data["parsed"]["info"]["tokenAmount"]["uiAmount"]}`
        );
      }
    });
  };

  async function createAccountforWrap() {
    // parameters : connection ? selectedwallet, amount
    // should check if an MINT_NATIVE is already created
    const newAccount = new Keypair();

    try {
      const mainPubkey = selectedWallet?.publicKey;
      if (!mainPubkey || !selectedWallet) {
        throw new Error('wallet not connected');
      }
      const transac = new Transaction();

      transac.add(
        SystemProgram.createAccount({
          fromPubkey: mainPubkey,
          lamports: await Token.getMinBalanceRentForExemptAccount(connection),
          newAccountPubkey: newAccount.publicKey,
          programId: TOKEN_PROGRAM_ID,
          space: AccountLayout.span,
        })
      );

      transac.add(
        SystemProgram.transfer({
          fromPubkey: mainPubkey,
          toPubkey: newAccount.publicKey,
          lamports: 20000,
        })
      );

      transac.add(
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          NATIVE_MINT,
          newAccount.publicKey,
          mainPubkey
        )
      )

      addLog('Getting recent blockhash');
      transac.recentBlockhash = (
        await connection.getRecentBlockhash()
      ).blockhash;

      addLog('Sending signature request to wallet');
      transac.feePayer = mainPubkey;

      //transac.partialSign(newAccount)
      const signed = await selectedWallet.signTransaction(transac);
      //signed.serialize()
      signed.partialSign(newAccount)
      addLog('signed :' + signed + '');
      const signature2 = await connection.sendRawTransaction(signed.serialize());
      addLog('Sending transaction succes : ' + signature2 + '');
      const confirmation = await connection.confirmTransaction(signature2, 'singleGossip');
      addLog('Confirmation status ' + confirmation.value);
      console.log("Confirmation : ", confirmation)

    } catch (e) {
      addLog('ERROR ::  ' + e);
      console.log(`eeeee`, e);

    }
  }

  return (
    <div className="App">
      <h1>Wallet Adapter playground</h1>
      <div>Network: {network}</div>
      <div>
        Waller provider:{' '}
        <input
          type="text"
          value={providerUrl}
          onChange={(e) => setProviderUrl(e.target.value.trim())}
        />
      </div>
      {selectedWallet && selectedWallet.connected ? (
        <div style={{ marginTop: "10px" }}>
          <div>Wallet address: {selectedWallet.publicKey?.toBase58()}.</div>
          <button style={{ background: "green", padding: "8px", margin: "6px" }} onClick={sendTransaction}>Send Transaction</button>
          <button style={{ background: "green", padding: "8px", margin: "6px" }} onClick={createAccountforWrap}>Create token account</button>
          <button style={{ background: "green", padding: "8px", margin: "6px" }} onClick={unwrapSafe}>Unwrap SAFE</button>
          {/*<button onClick={signMessage}>Sign Message</button>*/}
          <button style={{ color: "white", background: "black", padding: "8px", margin: "6px" }} onClick={() => selectedWallet.disconnect()}>
            Disconnect
          </button>
          <button style={{ background: "green", padding: "8px", margin: "6px" }} onClick={checkWrappedSafe}>WSAFE CHECK</button>
          <div></div>
        </div>
      ) : (
        <div>
          <button style={{ background: "green", padding: "3px", margin: "6px" }} onClick={() => setSelectedWallet(urlWallet)}>
            Connect to Wallet
          </button>
          {/*<button onClick={() => setSelectedWallet(injectedWallet)}>
            Connect to Injected Wallet
      </button>*/}
        </div>
      )}
      <hr />
      <div className="logs">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
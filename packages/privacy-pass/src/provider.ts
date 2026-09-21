import { Oprf } from "@cloudflare/voprf-ts";
import { CryptoNoble } from "@cloudflare/voprf-ts/crypto-noble";
// Official provider supported by voprf-ts; initialized before Privacy Pass captures its group.
Oprf.Crypto = CryptoNoble;

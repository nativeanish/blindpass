# RFC 9578 reference vector

The public test key and vector in `rfc9578-go.json` are the first Go reference vector distributed by Cloudflare under Apache-2.0:
https://github.com/cloudflare/privacypass-ts/blob/main/test/test_data/priv_verif_rfc9578.go.json

This is published test material, never a deployment key. The test matches request bytes, evaluated element, final token, proof validation, and verification. DLEQ proof randomness means newly generated proof bytes need not match the vector.

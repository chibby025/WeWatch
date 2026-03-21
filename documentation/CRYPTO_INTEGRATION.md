# WeWatch Crypto Integration Plan

**Status:** 📋 Planning Phase - Ready for Implementation  
**Last Updated:** March 21, 2026  
**Business KYC Status:** ⏳ Pending (Required for Circle API withdrawals)  
**Implementation Timeline:** 3-5 days (after KYC approval)

---

## 🎯 Strategic Goals

### Why Crypto?
1. **Investor Appeal** - Web3 integration shows innovation and scalability
2. **Job Opportunities** - Demonstrates blockchain development skills
3. **International Reach** - Bypass local payment gateway limitations
4. **Hedge Against Currency** - USDT/USDC protects against Naira devaluation
5. **Competitive Edge** - First Web3-enabled watch party platform in Africa

### Token Economics Model
**WeWatch uses a buy/sell spread model (NOT a blockchain token):**
- Tokens = Database credits (like current system)
- Users buy at premium rate, withdraw at lower rate
- Platform profits from spread (26-50% margin)

**Naira Model (Current):**
```
Buy Rate:  ₦165/token (user pays)
Sell Rate: ₦122/token (host withdraws)
Spread:    ₦43/token (26% profit)
```

**Crypto Model (Planned):**
```
Buy Rate:  $0.167/token (user pays with USDC)
Sell Rate: $0.10/token (host withdraws to USDC)
Spread:    $0.067/token (40% profit)

Fee Split: 50/50 on withdrawal fees
- Circle API fee: $0.50/transfer
- Host pays: $0.25
- Platform absorbs: $0.25
```

**Why this works:**
- ✅ No custom blockchain token needed
- ✅ No smart contract development
- ✅ No liquidity pools required
- ✅ Full price control
- ✅ Zero gas fees for users
- ✅ Same model as successful Naira system

---

## 💎 Phase 1: Crypto Payments (Quick Win)

**Focus:** Accept crypto for token purchases, maintain existing token system

### Implementation: Accept Crypto for Tickets & Token Purchases

#### **Priority 1: Stablecoin Payments**
- **Supported Coins**: USDT, USDC (avoid volatility)
- **Networks**: 
  - Polygon (low gas fees: ~$0.01)
  - Base (Coinbase's L2, ultra-cheap)
  - BNB Chain (popular in Africa)

#### **Gateway Options**

**Option A: Coinbase Commerce (Recommended)**
- ✅ Simple REST API integration
- ✅ No KYC required for merchants
- ✅ Supports USDT, USDC, ETH, BTC
- ✅ Auto-converts to fiat (optional)
- ✅ Webhook notifications
- ⏱️ Setup Time: 2-3 days

**Implementation:**
```javascript
// Frontend: paymentApi.js
import { CoinbaseCommerceButton } from 'react-coinbase-commerce';

export const createCryptoPayment = async (amount, type) => {
  // Backend creates charge
  const response = await apiClient.post('/api/payments/crypto/create-charge', {
    amount_usd: amount,
    type: type, // 'ticket' or 'tokens'
    metadata: { user_id, session_id }
  });
  
  return response.data.hosted_url;
};
```

```go
// Backend: crypto_payment_handlers.go
func CreateCryptoCharge(c *gin.Context) {
    // Create Coinbase Commerce charge
    charge := coinbase.CreateCharge({
        Name: "WeWatch Ticket Purchase",
        Description: "Cinema 3D Event Ticket",
        PricingType: "fixed_price",
        LocalPrice: {
            Amount: "10.00",
            Currency: "USD"
        },
        RedirectUrl: "https://wewatch.app/payment/success",
        CancelUrl: "https://wewatch.app/payment/cancel"
    })
    
    c.JSON(200, gin.H{"hosted_url": charge.HostedUrl})
}
```

**Option B: NOWPayments**
- ✅ Supports 300+ cryptocurrencies
- ✅ Lower fees (0.5%)
- ✅ API-based integration
- ⚠️ Less trusted than Coinbase
- ⏱️ Setup Time: 3-4 days

**Option C: Alchemy Pay**
- ✅ Focuses on emerging markets
- ✅ Fiat on/off ramps
- ✅ Mobile-optimized
- ⏱️ Setup Time: 4-5 days

#### **Backend Flow**
```
User clicks "Pay with Crypto"
    ↓
Backend creates charge (POST /coinbase/charge)
    ↓
Redirect user to Coinbase hosted page
    ↓
User pays with MetaMask/Coinbase Wallet
    ↓
Webhook triggers: payment.confirmed
    ↓
Backend validates webhook signature
    ↓
Credit user account (tokens or ticket)
    ↓
Send email confirmation
```

#### **Database Changes**
```sql
-- Add crypto payment tracking
ALTER TABLE token_transactions 
ADD COLUMN payment_provider VARCHAR(50), -- 'coinbase_commerce', 'nowpayments'
ADD COLUMN crypto_currency VARCHAR(10),  -- 'USDT', 'USDC', 'ETH'
ADD COLUMN crypto_amount DECIMAL(18,8),  -- Amount in crypto
ADD COLUMN crypto_network VARCHAR(50),   -- 'polygon', 'base', 'ethereum'
ADD COLUMN transaction_hash VARCHAR(100); -- Blockchain tx hash

ALTER TABLE session_tickets
ADD COLUMN payment_provider VARCHAR(50),
ADD COLUMN crypto_currency VARCHAR(10),
ADD COLUMN crypto_amount DECIMAL(18,8),
ADD COLUMN crypto_network VARCHAR(50),
ADD COLUMN transaction_hash VARCHAR(100);
```

#### **Benefits**
- ✅ **No Paystack Limits** - Accept payments from anywhere
- ✅ **Lower Fees** - 1% vs Paystack's 1.5% + ₦100
- ✅ **Instant Settlement** - Get USDT immediately
- ✅ **International Users** - Accept USD, EUR holders
- ✅ **Investor Magnet** - Shows Web3 readiness

#### **Estimated Impact**
- **User Growth**: +20% international users
- **Revenue**: +15% from crypto-preferring users
- **Investor Interest**: +50% (Web3 narrative)

---

## 🎟️ Phase 2: NFT Event Tickets (High Impact)

### Implementation: Tickets as NFTs

#### **Why NFTs?**
- **Proof of Ownership** - Verifiable, transferable
- **Secondary Market** - Users can resell tickets
- **Collectibles** - Proof of attendance badges
- **Anti-Fraud** - Can't duplicate NFT tickets
- **Sponsorship Potential** - Branded NFT collections

#### **Tech Stack**
- **Blockchain**: Polygon (low gas fees)
- **Standard**: ERC-721 or ERC-1155
- **Library**: thirdweb SDK (simplest) or Alchemy SDK
- **Storage**: IPFS for ticket metadata/images

#### **Smart Contract Design**

```solidity
// EventTicketNFT.sol
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WeWatchEventTicket is ERC721, Ownable {
    struct TicketMetadata {
        string eventTitle;
        uint256 eventTimestamp;
        string roomId;
        string watchType; // "3d_cinema", "classroom", "video"
        bool isRedeemed;
    }
    
    mapping(uint256 => TicketMetadata) public tickets;
    uint256 private _tokenIdCounter;
    
    constructor() ERC721("WeWatch Event Ticket", "WWTICKET") {}
    
    function mintTicket(
        address buyer,
        string memory eventTitle,
        uint256 eventTimestamp,
        string memory roomId,
        string memory watchType
    ) public onlyOwner returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _mint(buyer, tokenId);
        
        tickets[tokenId] = TicketMetadata({
            eventTitle: eventTitle,
            eventTimestamp: eventTimestamp,
            roomId: roomId,
            watchType: watchType,
            isRedeemed: false
        });
        
        return tokenId;
    }
    
    function redeemTicket(uint256 tokenId) public {
        require(ownerOf(tokenId) == msg.sender, "Not ticket owner");
        require(!tickets[tokenId].isRedeemed, "Ticket already redeemed");
        
        tickets[tokenId].isRedeemed = true;
    }
    
    function getTicketMetadata(uint256 tokenId) 
        public view returns (TicketMetadata memory) 
    {
        return tickets[tokenId];
    }
}
```

#### **Backend Integration**

```go
// nft_ticket_handlers.go
import (
    "github.com/ethereum/go-ethereum/ethclient"
    "github.com/ethereum/go-ethereum/accounts/abi/bind"
)

func MintNFTTicket(c *gin.Context) {
    // After successful payment
    ticket := models.EventTicket{...}
    
    // Mint NFT on blockchain
    client, _ := ethclient.Dial("https://polygon-rpc.com")
    auth, _ := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
    
    contract, _ := NewWeWatchTicket(contractAddress, client)
    tx, _ := contract.MintTicket(
        auth,
        common.HexToAddress(buyer.WalletAddress),
        ticket.EventTitle,
        big.NewInt(ticket.EventStartTime.Unix()),
        ticket.RoomID,
        ticket.WatchType,
    )
    
    // Save NFT details to database
    ticket.NFTTokenID = tx.TokenID
    ticket.NFTContractAddress = contractAddress
    ticket.NFTTxHash = tx.Hash().Hex()
    db.Save(&ticket)
    
    c.JSON(200, gin.H{"nft_tx": tx.Hash().Hex()})
}
```

#### **Frontend Display**

```javascript
// MyTickets.jsx - Show NFT ticket with OpenSea link
const TicketCard = ({ ticket }) => (
  <div className="ticket-card">
    <img src={ticket.image_url} />
    <h3>{ticket.event_title}</h3>
    
    {ticket.nft_token_id && (
      <div className="nft-badge">
        <span>🎫 NFT Ticket #{ticket.nft_token_id}</span>
        <a 
          href={`https://opensea.io/assets/matic/${ticket.nft_contract_address}/${ticket.nft_token_id}`}
          target="_blank"
        >
          View on OpenSea
        </a>
        <button onClick={() => transferNFT(ticket.nft_token_id)}>
          🎁 Gift Ticket
        </button>
      </div>
    )}
  </div>
);
```

#### **Database Changes**
```sql
ALTER TABLE event_tickets
ADD COLUMN nft_token_id BIGINT,
ADD COLUMN nft_contract_address VARCHAR(100),
ADD COLUMN nft_tx_hash VARCHAR(100),
ADD COLUMN nft_network VARCHAR(50) DEFAULT 'polygon',
ADD COLUMN is_nft BOOLEAN DEFAULT FALSE;
```

#### **Benefits**
- ✅ **Resale Market** - Users trade tickets P2P
- ✅ **Proof of Attendance** - Keep NFT as memory
- ✅ **Brand Value** - Premium NFT collections
- ✅ **Anti-Scalping** - Smart contract limits
- ✅ **Investor Appeal** - NFT marketplace potential

#### **Estimated Impact**
- **Premium Pricing**: +30% for NFT tickets
- **Trading Fees**: 2.5% on secondary sales
- **Brand Recognition**: Featured on OpenSea
- **Funding Appeal**: Web3 narrative unlocked

---

## 🔒 Phase 3: Smart Contract Escrow (Trust Layer)

### Implementation: Trustless Ticket Refunds

#### **Problem**
- Users worry: "What if event gets cancelled?"
- Hosts worry: "What if users request fake refunds?"

#### **Solution: Escrow Contract**

```solidity
// TicketEscrow.sol
pragma solidity ^0.8.0;

contract TicketEscrow {
    enum TicketStatus { Active, Redeemed, RefundRequested, Refunded }
    
    struct Escrow {
        address buyer;
        address host;
        uint256 amount;
        uint256 eventTimestamp;
        TicketStatus status;
    }
    
    mapping(uint256 => Escrow) public escrows;
    address public platformAdmin;
    
    modifier onlyAdmin() {
        require(msg.sender == platformAdmin, "Not admin");
        _;
    }
    
    // Buyer pays, funds locked
    function createEscrow(
        uint256 ticketId,
        address host,
        uint256 eventTimestamp
    ) external payable {
        escrows[ticketId] = Escrow({
            buyer: msg.sender,
            host: host,
            amount: msg.value,
            eventTimestamp: eventTimestamp,
            status: TicketStatus.Active
        });
    }
    
    // Event happens, host gets paid
    function releaseToHost(uint256 ticketId) external onlyAdmin {
        Escrow storage escrow = escrows[ticketId];
        require(block.timestamp > escrow.eventTimestamp, "Event not started");
        require(escrow.status == TicketStatus.Active, "Invalid status");
        
        escrow.status = TicketStatus.Redeemed;
        
        // 85% to host, 15% to platform
        uint256 hostAmount = (escrow.amount * 85) / 100;
        uint256 platformFee = escrow.amount - hostAmount;
        
        payable(escrow.host).transfer(hostAmount);
        payable(platformAdmin).transfer(platformFee);
    }
    
    // Event cancelled, refund buyer
    function refundBuyer(uint256 ticketId) external onlyAdmin {
        Escrow storage escrow = escrows[ticketId];
        require(escrow.status == TicketStatus.Active, "Invalid status");
        
        escrow.status = TicketStatus.Refunded;
        payable(escrow.buyer).transfer(escrow.amount);
    }
}
```

#### **Benefits**
- ✅ **Transparent** - All funds visible on-chain
- ✅ **Automatic Refunds** - Smart contract enforces
- ✅ **Trust Building** - Users feel safe
- ✅ **Dispute Resolution** - Blockchain as arbiter
- ✅ **Platform Protection** - Fee guaranteed

#### **Estimated Impact**
- **Conversion Rate**: +25% (trust = sales)
- **Chargebacks**: -90% (blockchain proof)
- **Premium Positioning**: "Blockchain-secured tickets"

---

## 🪙 Phase 4: Token-Gated Events (Community Building)

### Implementation: NFT Holder Perks

#### **Concept**
- Own specific NFT → Get discount/free entry
- Build loyal communities around collections

#### **Examples**
```
- Bored Ape holders: 50% off all events
- CryptoPunks holders: Free VIP rooms
- WeWatch Genesis NFT: Lifetime free entry
- Local artist NFTs: Support Nigerian creators
```

#### **Implementation**

```go
// nft_gate_handlers.go
func CheckNFTOwnership(c *gin.Context) {
    walletAddress := c.Query("wallet")
    requiredNFT := c.Query("nft_contract")
    
    // Query blockchain
    client, _ := ethclient.Dial("https://polygon-rpc.com")
    contract, _ := NewERC721(requiredNFT, client)
    
    balance, _ := contract.BalanceOf(nil, common.HexToAddress(walletAddress))
    
    hasAccess := balance.Uint64() > 0
    
    c.JSON(200, gin.H{
        "has_access": hasAccess,
        "nft_balance": balance.Uint64(),
    })
}
```

```javascript
// Frontend: Token-gated event UI
const TokenGatedEvent = ({ event }) => {
  const { walletAddress } = useWallet();
  const hasNFT = useCheckNFTOwnership(walletAddress, event.required_nft);
  
  return (
    <div>
      {hasNFT ? (
        <button>Enter Event FREE (NFT Holder)</button>
      ) : (
        <>
          <p>Requires {event.required_nft_name}</p>
          <button>Buy Ticket ({event.price})</button>
        </>
      )}
    </div>
  );
};
```

#### **Benefits**
- ✅ **Community Building** - NFT holders = loyal fans
- ✅ **Marketing Tool** - Partner with NFT projects
- ✅ **Viral Potential** - NFT communities share
- ✅ **Revenue Diversification** - Sell access NFTs

---

## 💰 Phase 5: Crypto Earnings Dashboard (Host Benefits)

### Implementation: Hold Earnings in Crypto

#### **Feature**
- Host earns tokens → Convert to USDT
- Hold earnings in stablecoin wallet
- Withdraw to personal wallet (no bank needed)

#### **Implementation**

```go
// crypto_wallet_handlers.go
func ConvertTokensToCrypto(c *gin.Context) {
    var req struct {
        AmountTokens int    `json:"amount_tokens"`
        TargetCrypto string `json:"target_crypto"` // "USDT", "USDC"
    }
    c.BindJSON(&req)
    
    // Convert tokens to USD
    amountUSD := float64(req.AmountTokens) * 0.10
    
    // Send USDT to user's wallet
    txHash := sendUSDT(user.CryptoWalletAddress, amountUSD)
    
    // Deduct tokens from wallet
    wallet.DeductTokens(req.AmountTokens)
    
    // Record transaction
    tx := models.TokenTransaction{
        UserID: user.ID,
        Amount: -req.AmountTokens,
        Type: "crypto_withdrawal",
        CryptoCurrency: req.TargetCrypto,
        TxHash: txHash,
    }
    db.Create(&tx)
    
    c.JSON(200, gin.H{"tx_hash": txHash})
}
```

#### **Benefits**
- ✅ **Instant Withdrawals** - No bank delays
- ✅ **No Limits** - Bypass CBN restrictions
- ✅ **Hedge Inflation** - USDT protects value
- ✅ **Global Payments** - Receive from anywhere

---

## 📊 Phase 6: Blockchain Analytics (Transparency)

### Implementation: Public Revenue Dashboard

#### **Concept**
- All ticket sales on-chain
- Public analytics at `wewatch.app/blockchain-stats`
- Investors can verify revenue

#### **Metrics to Display**
```
- Total NFT tickets minted: 12,543
- Total crypto payments: $456,789
- Total events hosted: 3,421
- Average ticket price: $12.50
- Top event: "Afrobeat Cinema Night" ($23,456)
```

#### **Benefits**
- ✅ **Investor Trust** - Verifiable on-chain data
- ✅ **Marketing** - Show platform growth
- ✅ **Transparency** - Public accountability
- ✅ **SEO** - Crypto press coverage

---

## 🚀 Implementation Roadmap

### **PHASE 1A: Crypto Payments (Receiving) - NO KYC REQUIRED**
**Timeline:** 3-5 days  
**Status:** ⏳ Ready to implement

#### Pre-requisites
- [ ] None! Can start immediately

#### Tasks
- [ ] Create Coinbase Commerce account (1 hour)
- [ ] Install Go SDK: `go get github.com/coinbase/coinbase-commerce-go`
- [ ] Create `backend/internal/handlers/crypto_payment_handlers.go`
- [ ] Implement `CreateCryptoCharge()` handler
- [ ] Implement `CryptoWebhook()` handler for payment confirmation
- [ ] Register routes in `main.go`
- [ ] Update `TokenPurchaseModal.jsx` to show crypto option
- [ ] Add crypto payment flow to frontend
- [ ] Test with testnet USDC
- [ ] Deploy to production

**Deliverable:** Users can buy tokens with USDC/USDT  
**Files to create:**
- `backend/internal/handlers/crypto_payment_handlers.go`
- `frontend/src/components/payment/CryptoPaymentFlow.jsx`
- `backend/migrations/20260323_add_crypto_payment_fields.sql`

---

### **PHASE 1B: Crypto Withdrawals (Sending) - KYC REQUIRED**
**Timeline:** 3-5 days (after business registration)  
**Status:** ⏸️ Blocked by business KYC  
**Blocker:** Need business registration certificate for Circle API

#### Pre-requisites
- [ ] **Business Registration Certificate** (required for Circle KYC)
- [ ] Business bank statement (last 3 months)
- [ ] Director/owner ID
- [ ] Proof of business address

#### Tasks (Once KYC approved)
- [ ] Create Circle account at https://app.circle.com/signup
- [ ] Submit business KYC documents (2-3 days approval time)
- [ ] Get Circle API credentials
- [ ] Install SDK: `go get github.com/circlefin/circle-go`
- [ ] Create `backend/internal/handlers/crypto_payout_handlers.go`
- [ ] Implement `RequestCryptoWithdrawal()` handler
- [ ] Add wallet address validation
- [ ] Create `CryptoWithdrawalModal.jsx` component
- [ ] Update `PaymentPage.jsx` to show dual-currency balance
- [ ] Add database migration for wallet_address field
- [ ] Test on Circle sandbox
- [ ] Deploy to production

**Deliverable:** Hosts can withdraw tokens to USDC wallet  
**Fee Structure:** 50/50 split
- Host pays: $0.25
- Platform absorbs: $0.25
- Total Circle fee: $0.50/transfer

**Files to create:**
- `backend/internal/handlers/crypto_payout_handlers.go`
- `frontend/src/components/payment/CryptoWithdrawalModal.jsx`
- `backend/migrations/20260323_add_crypto_withdrawal_fields.sql`

---

### **PHASE 2: NFT Tickets (Future - Not Priority)**
**Timeline:** 2-3 weeks  
**Status:** 📋 Planned (implement after Phase 1 working)

- [ ] Deploy smart contract to Polygon testnet
- [ ] Mint NFT on ticket purchase
- [ ] Display NFT details in My Tickets
- [ ] Add OpenSea link
- **Deliverable**: Tickets as collectible NFTs

---

### **PHASE 3: Advanced Features (6+ months)**
- [ ] Escrow smart contracts
- [ ] Token-gated events
- [ ] NFT holder perks
- [ ] Blockchain analytics dashboard

---

## 💵 Cost & Timeline Summary

### **Phase 1A: Crypto Payments (Receiving)**
| Item | Cost | Timeline | KYC Required? |
|------|------|----------|---------------|
| Coinbase Commerce Account | $0 | 1 hour | ❌ No |
| Development Time | $0 | 3-5 days | ❌ No |
| Testing | $0 | 1 day | ❌ No |
| **Total Phase 1A** | **$0** | **4-6 days** | **❌ No** |

**Transaction Fees:** 1% per crypto payment (Coinbase Commerce)

---

### **Phase 1B: Crypto Withdrawals (Sending)**
| Item | Cost | Timeline | KYC Required? |
|------|------|----------|---------------|
| Business Registration | ₦50,000-100,000 | 2-4 weeks | ✅ Yes |
| Circle Account Setup | $0 | 1 hour | ✅ Yes (business docs) |
| Circle KYC Approval | $0 | 2-3 days | ✅ Yes |
| Development Time | $0 | 3-5 days | ❌ No |
| Testing | $0 | 1 day | ❌ No |
| **Total Phase 1B** | **₦50K-100K** | **3-5 weeks** | **✅ Yes** |

**Withdrawal Fees:** $0.50 per transfer (50/50 split: host pays $0.25, platform absorbs $0.25)

---

### **Immediate Action Items (Next 2 Days)**

#### 🟢 **Can Start Now (No Blockers)**
1. **Coinbase Commerce Setup**
   - Create account: https://commerce.coinbase.com/signup
   - Get API key and webhook secret
   - Save credentials securely

2. **Code Preparation**
   - Review `backend/internal/handlers/crypto_payment_handlers.go` implementation
   - Review `frontend/src/components/payment/TokenPurchaseModal.jsx` changes needed
   - Review database migration SQL

3. **Testing Environment**
   - Test Coinbase Commerce on sandbox
   - Create test USDC wallet for testing

#### 🔴 **Blocked (Need Business Registration)**
1. **Circle API Setup**
   - Cannot proceed until business registration complete
   - Prepare documents while waiting:
     - Business address proof
     - Bank statements (3 months)
     - Director ID copy

2. **Documentation Needed for Circle KYC**
   - Certificate of Incorporation (CAC)
   - Memorandum of Association
   - Director identification
   - Business bank account statement

---

## 📋 When You Return (Implementation Checklist)

### **Day 1: Coinbase Commerce Integration**
```bash
# 1. Install SDK
cd ~/WeWatch/backend
go get github.com/coinbase/coinbase-commerce-go

# 2. Add environment variables
echo "COINBASE_COMMERCE_API_KEY=your_key_here" >> .env
echo "COINBASE_COMMERCE_WEBHOOK_SECRET=your_secret_here" >> .env

# 3. Create handler file
touch backend/internal/handlers/crypto_payment_handlers.go
# Copy implementation from documentation

# 4. Register routes in main.go
# Add: protected.POST("/payments/crypto/create-charge", handlers.CreateCryptoCharge)
# Add: public.POST("/webhooks/coinbase", handlers.CryptoWebhook)

# 5. Run migration
psql -h localhost -U postgres -d wewatch_db -f backend/migrations/20260323_add_crypto_payment_fields.sql

# 6. Test
curl -X POST http://localhost:8080/api/payments/crypto/create-charge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"amount_tokens": 100, "type": "tokens"}'
```

### **Day 2-3: Frontend Integration**
```bash
# 1. Update TokenPurchaseModal
# Add crypto gateway option
# Show USDC pricing ($0.167/token)

# 2. Test payment flow
# Buy tokens with test USDC
# Verify webhook credits wallet

# 3. Deploy to staging
# Test end-to-end on staging environment
```

### **Day 4-6: Circle Integration (If Business Registration Ready)**
```bash
# 1. Complete Circle KYC
# Submit business documents
# Wait 2-3 days for approval

# 2. Install Circle SDK
go get github.com/circlefin/circle-go

# 3. Create withdrawal handler
touch backend/internal/handlers/crypto_payout_handlers.go

# 4. Update PaymentPage UI
# Show dual-currency balance
# Add "Withdraw to Crypto" button

# 5. Test on Circle sandbox
# Test withdrawals with test USDC
```

---

## 🔧 Complete Code Implementation

### **File 1: `backend/internal/handlers/crypto_payment_handlers.go`**

See full implementation in main conversation above (includes):
- `CreateCryptoCharge()` - Generate Coinbase payment link
- `CryptoWebhook()` - Handle payment confirmations
- Token crediting logic
- Platform accounting updates

### **File 2: `frontend/src/components/payment/CryptoWithdrawalModal.jsx`**

See full implementation in main conversation above (includes):
- Wallet address input
- Network selection (Polygon, Base, Ethereum)
- Amount input with validation
- Fee breakdown display
- Transaction confirmation

### **File 3: Database Migration**

```sql
-- File: backend/migrations/20260323_add_crypto_payment_fields.sql

-- Add crypto withdrawal tracking
ALTER TABLE payout_requests
ADD COLUMN wallet_address VARCHAR(100),
ADD COLUMN crypto_network VARCHAR(50), -- 'polygon', 'base', 'ethereum'
ADD COLUMN transaction_hash VARCHAR(100),
ADD COLUMN currency VARCHAR(10); -- 'NGN', 'USDC', 'USDT'

-- Add crypto balance tracking
ALTER TABLE platform_accounting
ADD COLUMN usdc_balance DECIMAL(15,2) DEFAULT 0.00,
ADD COLUMN usdc_reserve_balance DECIMAL(15,2) DEFAULT 0.00,
ADD COLUMN lifetime_crypto_revenue DECIMAL(15,2) DEFAULT 0.00;

-- Index for crypto transactions
CREATE INDEX idx_payout_crypto ON payout_requests(payout_type, currency) 
WHERE payout_type = 'crypto';

-- Index for wallet addresses
CREATE INDEX idx_payout_wallet ON payout_requests(wallet_address) 
WHERE wallet_address IS NOT NULL;
```

---

## ✅ Success Metrics

### **Phase 1A Success (Crypto Payments)**
- [ ] Users can buy tokens with USDC/USDT
- [ ] Payments reflect in wallet within 2 minutes
- [ ] Platform accounting updates correctly
- [ ] Zero payment failures

### **Phase 1B Success (Crypto Withdrawals)**
- [ ] Hosts can withdraw to any USDC wallet
- [ ] Withdrawals complete within 5 minutes
- [ ] 50/50 fee split applied correctly
- [ ] Transaction hash visible in UI

### **Business Impact Targets**
- **Month 1:** 10% of payments via crypto
- **Month 3:** 25% of payments via crypto
- **Month 6:** $10K+ monthly crypto revenue
- **Year 1:** International users = 30% of base

---

## � Resources & Links

### **Setup Accounts**
- **Coinbase Commerce:** https://commerce.coinbase.com/signup (No KYC)
- **Circle Account:** https://app.circle.com/signup (Business KYC required)

### **Documentation**
- [Coinbase Commerce API Docs](https://commerce.coinbase.com/docs/)
- [Circle API Docs](https://developers.circle.com/docs)
- [Circle Go SDK](https://github.com/circlefin/circle-go)
- [Coinbase Commerce Go SDK](https://github.com/coinbase/coinbase-commerce-go)

### **Testing**
- **Polygon Testnet Faucet:** https://faucet.polygon.technology/
- **Circle Sandbox:** https://sandbox.circle.com/
- **Test USDC:** Available on testnets

### **Explorers**
- **Polygon:** https://polygonscan.com/
- **Base:** https://basescan.org/
- **Ethereum:** https://etherscan.io/

---

## 🚨 Important Notes

### **Before You Start Implementation**
1. ✅ **Phase 1A (Coinbase Commerce)** - Can start immediately, no blockers
2. ⏸️ **Phase 1B (Circle API)** - Need business registration first

### **Security Reminders**
- Never commit API keys to Git
- Use environment variables for all secrets
- Validate all wallet addresses before sending funds
- Test on sandbox/testnet before production
- Keep webhook secrets secure

### **Business Registration Priority**
- Required for Circle API (crypto withdrawals)
- Register business ASAP to unblock Phase 1B
- Estimated cost: ₦50,000-100,000
- Timeline: 2-4 weeks in Nigeria

### **Development Priority**
1. **Week 1:** Implement Phase 1A (crypto payments)
2. **Week 2-4:** Wait for business registration
3. **Week 5:** Implement Phase 1B (crypto withdrawals)
4. **Week 6+:** Monitor and optimize

---

**Status:** 📋 Documentation Complete - Ready for Implementation  
**Last Updated:** March 21, 2026  
**Next Review:** After Phase 1A implementation complete

## ✅ Success Metrics

### **KPIs to Track**
| Metric | Target | Timeline |
|--------|--------|----------|
| Crypto payment adoption | 15% of transactions | Month 3 |
| NFT tickets minted | 1,000 NFTs | Month 6 |
| International users | 20% of user base | Month 6 |
| Secondary NFT sales | ₦500K/month | Month 9 |
| Investor meetings secured | 10 meetings | Month 3 |
| Funding raised | $100K seed | Month 6 |

---

## 🎉 Conclusion

**Why This Works:**

1. **Technical Feasibility**: All tools exist, 2-week MVP
2. **Market Fit**: Nigerians want dollar-denominated earnings
3. **Competitive Moat**: First Web3 watch party platform
4. **Investor Catnip**: Web3 + NFT + Africa = funding magnet
5. **Revenue Boost**: +30% from crypto users + NFT fees

**Next Steps:**

1. ✅ Review this document with team
2. ✅ Choose Phase 1 gateway (Coinbase Commerce)
3. ✅ Create testnet smart contract
4. ✅ Build weekend MVP
5. ✅ Demo to investors

**Timeline to Demo:** 2 weeks (working crypto payments + NFT ticket)

---

**Status:** 📝 Planning Complete  
**Owner:** Engineering Team  
**Review Date:** March 20, 2026  
**Priority:** HIGH (Funding blocker)

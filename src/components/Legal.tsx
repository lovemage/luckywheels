import { useState } from 'react';

export type LegalTab = 'privacy' | 'terms';

export function Legal({ initialTab = 'privacy', onClose }: { initialTab?: LegalTab; onClose: () => void }) {
  const [tab, setTab] = useState<LegalTab>(initialTab);
  return (
    <div className="legal-page" role="dialog" aria-modal="true" aria-label="條款與隱私權">
      <header className="legal-header">
        <h1>條款與隱私權</h1>
        <button className="legal-close" onClick={onClose} aria-label="關閉">×</button>
      </header>
      <nav className="legal-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'privacy'}
          className={tab === 'privacy' ? 'active' : ''}
          onClick={() => setTab('privacy')}
        >
          隱私權政策
        </button>
        <button
          role="tab"
          aria-selected={tab === 'terms'}
          className={tab === 'terms' ? 'active' : ''}
          onClick={() => setTab('terms')}
        >
          服務條款
        </button>
      </nav>
      <article className="legal-content" role="tabpanel">
        {tab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
      </article>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
      <h2>隱私權政策</h2>
      <p className="legal-updated">最後更新日期：2026/06/05</p>

      <h3>一、適用範圍</h3>
      <p>本隱私權政策適用於您使用本平台提供之「會員抽獎」相關服務時所涉及之個人資料處理。當您完成登入並使用本服務，即表示您已詳閱並同意本政策。</p>

      <h3>二、蒐集之個人資料項目</h3>
      <p>本平台僅蒐集為提供服務所必要之最少資料，包括：</p>
      <ul>
        <li>LINE 使用者識別碼（lineUserId）、LINE 顯示名稱、LINE 大頭貼圖片網址</li>
        <li>由您於註冊時自行填寫之暱稱、娛樂城會員編號</li>
        <li>抽獎紀錄、積分餘額、兌換序號、操作時間戳記</li>
        <li>連線資訊（IP 位址、使用者代理字串），僅用於系統稽核與防詐</li>
      </ul>

      <h3>三、蒐集目的、期間、地區、對象與方式</h3>
      <p>所蒐集之個人資料僅用於下列目的：</p>
      <ul>
        <li>會員身分識別與帳號管理</li>
        <li>抽獎與彩金核對、發放</li>
        <li>客戶服務、爭議處理與系統稽核</li>
        <li>依法令或主管機關要求之配合事項</li>
      </ul>
      <p>資料儲存期間：自您完成註冊起，至您要求刪除帳號或法律規定之保存期間屆滿為止。儲存地區：中華民國境內。處理對象：本平台及其受託處理者（如雲端服務供應商）。</p>

      <h3>四、您對個人資料之權利</h3>
      <p>依個人資料保護法第 3 條規定，您就您的個人資料享有下列權利：查詢或請求閱覽、請求製給複本、請求補充或更正、請求停止蒐集處理或利用、請求刪除。如欲行使上述權利，請透過客服管道與我們聯繫。</p>

      <h3>五、個人資料之保護</h3>
      <p>本平台採用 HTTPS 加密傳輸、密碼雜湊儲存（bcrypt）、JWT 簽章工作階段、cookie HttpOnly+Secure+SameSite=Lax 等技術措施保護您的資料，並對內部存取進行權限分級與稽核紀錄。</p>

      <h3>六、Cookie 政策</h3>
      <p>本平台使用必要的工作階段 Cookie 以維持您的登入狀態，包含：<code>lw_session</code>（會員登入）、<code>lw_oauth_state</code>、<code>lw_oauth_nonce</code>（LINE OAuth 防偽）。我們不使用第三方追蹤 Cookie。</p>

      <h3>七、政策修訂</h3>
      <p>本平台保留隨時修訂本政策之權利，修訂後將公告於本頁並更新「最後更新日期」。繼續使用即視為同意修訂後之內容。</p>

      <h3>八、聯絡我們</h3>
      <p>如您對本政策有任何疑問，請透過官方客服管道與我們聯繫。</p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <h2>服務條款</h2>
      <p className="legal-updated">最後更新日期：2026/06/05</p>

      <h3>一、條款接受</h3>
      <p>歡迎使用本平台所提供之「會員抽獎」服務（以下稱本服務）。當您透過 LINE 登入並繼續使用本服務時，即視為您已詳閱、瞭解並同意接受本條款全部約定。</p>

      <h3>二、服務說明</h3>
      <p>本服務透過積分制度提供轉盤抽獎機制。會員以積分參與抽獎，中獎結果由伺服器端依官方公告之機率設定即時計算決定。中獎獎項以兌換序號方式發放，會員需依平台公告之兌換流程申請領取。</p>

      <h3>三、會員資格</h3>
      <ul>
        <li>本服務僅開放具備有效 LINE 帳號之自然人使用。</li>
        <li>會員須於首次使用時，提供有效之暱稱及娛樂城會員編號完成綁定。</li>
        <li>會員應確保所提供之資料正確且未冒用他人身分，違反者本平台有權終止服務。</li>
      </ul>

      <h3>四、積分與抽獎規則</h3>
      <ul>
        <li>積分為本平台內部之點數，僅供抽獎使用，不得轉讓、買賣、提現或兌換為現金。</li>
        <li>積分由管理員後台派發，會員不得自行修改。</li>
        <li>單抽與連抽之積分消耗及次數，依官方公告為準。</li>
        <li>抽獎結果之機率設定及成本控管邏輯，依本平台後端系統設定為準。</li>
      </ul>

      <h3>五、兌換與彩金</h3>
      <ul>
        <li>中獎時平台會產生一組 Redemption 兌換序號，會員應依公告流程（如截圖傳送客服）申請兌換。</li>
        <li>兌換之有效期間、方式與限制依公告為準。逾期未兌換者，視為自動放棄。</li>
        <li>本平台保留審核兌換申請之權利，如發現異常或詐欺行為，得拒絕兌換並停權帳號。</li>
      </ul>

      <h3>六、會員義務與禁止行為</h3>
      <p>會員不得從事下列行為：</p>
      <ul>
        <li>使用任何自動化工具、機器人或多開帳號從事抽獎或套利。</li>
        <li>偽造、變造或盜用他人 LINE 帳號或娛樂城會員編號。</li>
        <li>透過任何方式對本平台系統進行未授權存取、攻擊或干擾。</li>
        <li>從事任何違反法令或公序良俗之行為。</li>
      </ul>

      <h3>七、智慧財產權</h3>
      <p>本平台所有頁面、介面、商標、文字、圖片、程式碼及其他內容之智慧財產權，均屬本平台或其授權人所有。未經書面同意，會員不得以任何方式重製、改作、散布或商業利用。</p>

      <h3>八、第三方服務</h3>
      <p>本服務透過 LINE Login 進行身分驗證。LINE 相關之使用條款與隱私政策請依 LINE 官方公告為準，本平台不就 LINE 服務之中斷、變更或終止承擔責任。</p>

      <h3>九、服務修改與終止</h3>
      <p>本平台保留隨時修改、暫停或終止全部或部分服務之權利，且無需事前通知。對於任何修改或終止所造成之損失，本平台不負任何賠償責任。</p>

      <h3>十、免責聲明</h3>
      <p>本平台已盡力維護服務之穩定運作，但對於系統故障、網路中斷、不可抗力或非可歸責於本平台之事由所造成之服務中斷或資料毀損，本平台不負任何賠償責任。</p>

      <h3>十一、法律適用與爭議解決</h3>
      <p>本條款之解釋及適用，以中華民國法律為準據法。因本服務所生之爭議，雙方同意以臺灣臺北地方法院為第一審管轄法院。</p>
    </>
  );
}

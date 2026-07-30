import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "みんなが幸せになれる募集案｜ブルアカ募集期待値ラボ",
  description: "募集スタンプを消えない資産として残し、現行仕様に近い取得性能と安心して喜べるガチャ体験を両立する非公式の改善案。",
};

const completionRows = [
  { target: "1人", current: "79.0 ± 46.1連", proposal: "80.8 ± 42.0連" },
  { target: "2人", current: "151.3 ± 65.4連", proposal: "148.2 ± 72.0連" },
  { target: "3人", current: "223.5 ± 82.6連", proposal: "226.3 ± 95.0連" },
  { target: "4人", current: "298.8 ± 100.8連", proposal: "304.4 ± 108.1連" },
];

export default function ProposalPage() {
  return (
    <main className="proposal-page">
      <header className="proposal-hero" id="top">
        <nav className="proposal-nav" aria-label="ページナビゲーション">
          <a className="brand" href="../" aria-label="募集期待値ラボへ戻る">
            <span className="brand-mark">Σ</span>
            <span><b>募集期待値ラボ</b><small>UNOFFICIAL DESIGN NOTE</small></span>
          </a>
          <a className="proposal-back" href="../">← 確率計算へ戻る</a>
        </nav>

        <div className="proposal-hero-copy">
          <span className="eyebrow">A HAPPIER ALTERNATIVE</span>
          <p className="proposal-overline">非公式の募集システム改善案</p>
          <h1>もっと、みんなが幸せになれる<br />仕組みにできたかもしれない。</h1>
          <p className="proposal-lead">新仕様は、欲しい生徒をそろえる費用を下げています。それでも喜びにくいのは、PUを引いた瞬間に、それまで貯めたチャージが消えるからです。</p>
          <p>取得性能を旧仕様へ戻す必要はありません。消えない資産と、下振れを助ける補正を分ければ、得をしながら素直に喜べる募集体験を作れます。</p>
          <div className="proposal-hero-points" aria-label="提案の要点">
            <span>資産は消えない</span>
            <span>平均コストは現行並み</span>
            <span>払い出しも現行並み</span>
          </div>
        </div>
      </header>

      <section className="proposal-section proposal-problem" aria-labelledby="problem-title">
        <header className="proposal-section-heading">
          <span>01 / THE PROBLEM</span>
          <h2 id="problem-title">当たったのに、少し損した気持ちになる</h2>
          <p>問題は、チャージが最低保証のゲージなのか、貯めた資産なのかが、体験の中で分かれないことです。</p>
        </header>
        <div className="proposal-problem-grid">
          <article>
            <b>200連へ近づくほど</b>
            <h3>PUを引く喜びが小さくなる</h3>
            <p>190チャージでPUを引けば、最大190チャージが消えます。遅く引くほど大きなものを失ったように感じます。</p>
          </article>
          <article>
            <b>100連目では</b>
            <h3>どちらの結果にも残念さが混ざる</h3>
            <p>PUでなければ50%に外れた悲しさが残り、PUなら100チャージが消えます。救済の節目なのに、喜びきれません。</p>
          </article>
          <article>
            <b>募集全体では</b>
            <h3>大きなゴールが見えにくい</h3>
            <p>無料チケットや確定枠に価値が分散し、旧仕様の「200ポイントで選べる」という分かりやすい達成感が薄くなります。</p>
          </article>
        </div>
      </section>

      <section className="proposal-section proposal-system" aria-labelledby="system-title">
        <header className="proposal-section-heading light">
          <span>02 / THE PROPOSAL</span>
          <h2 id="system-title">資産と救済を、別の仕組みにする</h2>
          <p>募集スタンプは交換できる資産。PU応援補正は下振れを助ける仕組み。それぞれの役割を画面上でも分けます。</p>
        </header>

        <div className="proposal-rule-flow" aria-label="提案仕様の流れ">
          <article>
            <span>毎回</span>
            <strong>1連で1スタンプ</strong>
            <p>PUを引いても消えません。200スタンプで好きなPUを選べます。</p>
          </article>
          <i aria-hidden="true">→</i>
          <article className="highlight">
            <span>100連</span>
            <strong>★3確定＋80スタンプ</strong>
            <p>この開催で一度だけ。100連時点で合計180スタンプになります。</p>
          </article>
          <i aria-hidden="true">→</i>
          <article>
            <span>120連</span>
            <strong>最初のPU指名券</strong>
            <p>あと20連で200スタンプ。欲しいPUを自分で選べます。</p>
          </article>
        </div>

        <div className="proposal-soft-pity">
          <div>
            <span className="eyebrow">PU SUPPORT</span>
            <h3>長く引けないときだけ、PU率を少し上げる</h3>
            <p>通常の0.70%は下げません。通常抽選でPUを引けない状態が続いたときだけ、選択中PU率を段階的に上げます。</p>
          </div>
          <ol>
            <li><span>0～59回</span><strong>0.70%</strong></li>
            <li><span>60～99回</span><strong>0.75%</strong></li>
            <li><span>100回以上</span><strong>0.90%</strong></li>
          </ol>
          <p className="proposal-soft-note">PU指名券を使っても補正は消えません。通常抽選でPUを引いたときだけ0.70%へ戻ります。</p>
        </div>
      </section>

      <section className="proposal-section proposal-experience" aria-labelledby="experience-title">
        <header className="proposal-section-heading">
          <span>03 / THE EXPERIENCE</span>
          <h2 id="experience-title">どのタイミングで当たっても、素直にうれしい</h2>
        </header>
        <div className="proposal-experience-grid">
          <article>
            <span>早くPUを引いた</span>
            <h3>当たりに、将来の指名券が加わる</h3>
            <p>PUを引いてもスタンプは残ります。幸運と200スタンプの交換が、どちらか一方ではなく両方の得になります。</p>
          </article>
          <article>
            <span>100連まで引いた</span>
            <h3>外れ判定ではなく、ゴールが近づく</h3>
            <p>★3と80スタンプを受け取り、指名券まであと20連。100連目が、次へ進みたくなる明るい節目になります。</p>
          </article>
          <article>
            <span>なかなかPUを引けない</span>
            <h3>資産と確率の両方が前へ進む</h3>
            <p>スタンプを失わず、PU率も少しずつ上がります。運が悪い時間にも、二つの進捗が残ります。</p>
          </article>
        </div>
        <blockquote className="proposal-quote">「引けたからチャージが消えた」ではなく、<br />「引けた。しかも、指名券にも近づいた。」</blockquote>
      </section>

      <section className="proposal-section proposal-balance" aria-labelledby="balance-title">
        <header className="proposal-section-heading">
          <span>04 / THE BALANCE</span>
          <h2 id="balance-title">ユーザーだけが得をしすぎる案でもない</h2>
          <p>この提案は、現行仕様の取得性能と払い出し量へ近づくように調整しています。数値は、サイトと同じ★3率3.0%・PU率0.7%を基準にした計算結果です。</p>
        </header>

        <div className="proposal-balance-cards">
          <article>
            <span>4PU・400連分で全員確保</span>
            <div><b>現行 84.01%</b><i>≈</i><b>提案 83.95%</b></div>
            <p>差は0.06ポイントです。</p>
          </article>
          <article>
            <span>4PU・400連分のPU期待数</span>
            <div><b>現行 5.040人</b><i>≈</i><b>提案 5.034人</b></div>
            <p>運営側の平均払い出しも、ほぼ同じです。</p>
          </article>
        </div>

        <div className="proposal-table-wrap">
          <table>
            <thead><tr><th>全員確保目標</th><th>現行仕様</th><th>提案仕様</th></tr></thead>
            <tbody>
              {completionRows.map((row) => (
                <tr key={row.target}><th>{row.target}</th><td>{row.current}</td><td>{row.proposal}</td></tr>
              ))}
            </tbody>
          </table>
          <p>数値は「全員確保までに使う青輝石相当の平均連数 ± 標準偏差」です。提案と現行の平均差は約2～6連に収まります。</p>
        </div>
      </section>

      <section className="proposal-section proposal-conclusion" aria-labelledby="conclusion-title">
        <span className="eyebrow">MAYBE, THIS WAY</span>
        <h2 id="conclusion-title">得だから我慢する募集ではなく、<br />得をしたときに喜べる募集へ。</h2>
        <p>新仕様が改善した取得性能は、そのまま活かせます。旧仕様にあった安心感も、消えない募集スタンプとして残せます。</p>
        <p>ユーザーは、引いたPUと貯めた資産の両方を受け取る。運営は、現行仕様に近い払い出し量を維持する。完璧な正解とは限りませんが、こういう仕組みなら、もう少し多くの人が素直に喜べたかもしれません。</p>
        <a href="../">新旧仕様の確率計算へ戻る <span aria-hidden="true">→</span></a>
      </section>

      <footer className="proposal-footer">
        <div className="brand footer-brand"><span className="brand-mark">Σ</span><span><b>募集期待値ラボ</b><small>UNOFFICIAL CALCULATOR</small></span></div>
        <p>本ページは、公開情報をもとにした非公式の設計案です。実際の募集条件はゲーム内表示と公式告知を確認してください。</p>
        <a href="https://bluearchive.jp/news/newsJump/679" target="_blank" rel="noreferrer">公式告知 ↗</a>
      </footer>
    </main>
  );
}

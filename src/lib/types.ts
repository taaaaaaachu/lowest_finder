/**
 * ドメインの共有型。保存層(IndexedDB / SQLite)に依存しない純粋なデータ形。
 */

/** 比較の単位になる括り。配下に商品(Item)を持つ。 */
export interface Group {
	id: string;
	/** ユーザーが決めたタイトル。例: 「食器用洗剤」 */
	title: string;
	/** 表示用の単位ラベル。例: 「ml」。計算には使わない自由文字列。 */
	unitLabel: string;
}

/** グループにぶら下がる、実際に比較される1件。 */
export interface Item {
	id: string;
	groupId: string;
	/** 見分け用の任意ラベル。例: 「詰替1380ml」。 */
	name: string | null;
	/** 内容量。単価計算の分母。単位変換はしない(グループ内で単位を揃えるのはユーザー責任)。 */
	volume: number;
	/** 価格(円)。単価計算の分子。 */
	price: number;
	/** スクレイピング対象URL。無い場合は手入力のみのアイテム。 */
	url: string | null;
	/** スクレイピングで価格を取得した時刻(epoch ミリ秒)。未取得なら null。 */
	lastFetchedAt: number | null;
}

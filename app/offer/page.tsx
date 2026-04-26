import type { Metadata } from 'next';
import { LegalNavBar } from '@/components/LegalNavBar';

export const metadata: Metadata = {
  title: 'Публичная оферта — Вечеринкач',
  description: 'Публичная оферта об оказании услуг доступа к интерактивным играм',
};

const EFFECTIVE_DATE = '16 апреля 2026 г.';

export default function OfferPage() {
  return (
    <>
      <LegalNavBar />
      <div className="min-h-screen flex items-center justify-center p-4 py-10">
      <div
        className="w-full max-w-3xl rounded-2xl shadow-lg p-8 md:p-12"
        style={{ background: 'var(--panel)', color: 'var(--foreground)' }}
      >
        <h1
          className="text-2xl md:text-3xl font-bold text-center mb-2"
          style={{ fontFamily: 'var(--font-comic-cat)' }}
        >
          Публичная оферта
        </h1>
        <p className="text-center text-sm opacity-70 mb-8">об оказании услуг доступа к интерактивным играм</p>

        <div className="space-y-6 text-sm md:text-base leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">1. Общие положения</h2>
            <p>
              Настоящая публичная оферта (далее — «Оферта») является официальным предложением самозанятого
              <strong> Заднепровской Ирины Валентиновны</strong>, ИНН&nbsp;550503239538 (далее — «Исполнитель»),
              заключить договор об оказании услуг доступа к интерактивным онлайн-играм на условиях, изложенных ниже.
            </p>
            <p className="mt-2">
              Акцептом настоящей Оферты является факт оплаты услуги Пользователем. С момента оплаты договор
              считается заключённым на условиях Оферты.
            </p>
            <p className="mt-2 opacity-70 text-xs">Дата вступления в силу: {EFFECTIVE_DATE}</p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">2. Предмет договора</h2>
            <p>
              Исполнитель оказывает Пользователю услугу предоставления временного доступа к одной или нескольким
              интерактивным игровым сессиям на сайте <strong>vecherinkach.ru</strong> (игры «Вечеринкач»,
              «Креативач», «Пошутикач»), включая доступ к выбранному пакету игровых вопросов или функций.
            </p>
            <p className="mt-2">
              Услуга является цифровой. Никакие материальные товары в рамках настоящего договора не поставляются.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">3. Описание услуг и стоимость</h2>
            <p>
              Перечень доступных пакетов и актуальные фиксированные цены размещены на странице{' '}
              <a href="/pricing" className="underline" style={{ color: 'var(--accent-blue)' }}>
                vecherinkach.ru/pricing
              </a>
              . Все цены указаны в рублях РФ. Исполнитель не является плательщиком НДС (применяется налоговый режим НПД).
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">4. Порядок получения услуги</h2>
            <ol className="list-decimal list-inside space-y-1 opacity-90">
              <li>Пользователь выбирает нужный пакет или режим игры на сайте.</li>
              <li>Производит оплату через сервис ЮKassa.</li>
              <li>
                Немедленно после подтверждения оплаты Пользователю предоставляется код игровой комнаты или прямая
                ссылка для присоединения к игровой сессии.
              </li>
              <li>Доступ к сессии действует в течение одной игровой сессии (до её завершения).</li>
            </ol>
            <p className="mt-2 opacity-90">
              Доставка физических товаров не предусмотрена — услуга оказывается в электронном виде немедленно после
              оплаты.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">5. Оплата</h2>
            <p>
              Оплата производится в рублях РФ в полном объёме до начала оказания услуги. Приём платежей
              осуществляется через сервис ЮKassa (ООО «ЮМани», ОГРН&nbsp;1127711000031). Безопасность платежей
              обеспечивается стандартом PCI&nbsp;DSS. По факту оплаты Исполнитель формирует чек в приложении
              «Мой налог» (ФНС России) и направляет его Пользователю.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">6. Возврат средств</h2>
            <ul className="list-disc list-inside space-y-1 opacity-90">
              <li>
                <strong>До начала игровой сессии:</strong> Пользователь вправе отказаться от услуги и получить
                полный возврат средств, обратившись к Исполнителю по контактам, указанным в разделе&nbsp;8.
              </li>
              <li>
                <strong>После начала игровой сессии:</strong> возврат средств не производится, так как услуга
                считается оказанной в момент предоставления доступа к сессии.
              </li>
            </ul>
            <p className="mt-2 opacity-90">
              Срок обработки запроса на возврат — до 10 рабочих дней. Возврат осуществляется на реквизиты, с которых
              поступил платёж.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">7. Ответственность сторон</h2>
            <p>
              Исполнитель прилагает разумные усилия для обеспечения бесперебойной работы сервиса, однако не несёт
              ответственности за перебои, вызванные обстоятельствами непреодолимой силы, сбоями у третьих лиц
              (интернет-провайдеры, платёжные системы) или действиями Пользователя. В случае технической
              невозможности оказания оплаченной услуги по вине Исполнителя Пользователю производится полный возврат
              средств.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">8. Контакты Исполнителя</h2>
            <table className="w-full text-left">
              <tbody>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">ФИО</td>
                  <td className="py-2">Заднепровская Ирина Валентиновна</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">ИНН</td>
                  <td className="py-2">550503239538</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">Телефон</td>
                  <td className="py-2">
                    <a href="tel:+79088001638" className="underline" style={{ color: 'var(--accent-blue)' }}>
                      +7 908 800-16-38
                    </a>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">E-mail</td>
                  <td className="py-2">
                    <a href="mailto:kinolog.ai@gmail.com" className="underline" style={{ color: 'var(--accent-blue)' }}>
                      kinolog.ai@gmail.com
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 9 */}
          <section>
            <h2 className="font-bold text-base md:text-lg mb-2">9. Прочие условия</h2>
            <p>
              Настоящая Оферта и договор, заключаемый на её основании, регулируются законодательством Российской
              Федерации. Все споры разрешаются путём переговоров, а при недостижении согласия — в судебном порядке
              по месту нахождения Исполнителя. Исполнитель вправе в одностороннем порядке изменять условия
              Оферты. Новая редакция вступает в силу с момента её публикации на сайте.
            </p>
          </section>

        </div>

        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <a
            href="/requisites"
            className="inline-block px-6 py-2 rounded-full font-semibold transition-transform hover:scale-105"
            style={{ background: 'var(--panel-muted)', color: 'var(--foreground)' }}
          >
            Реквизиты
          </a>
          <a
            href="/"
            className="inline-block px-6 py-2 rounded-full font-semibold text-white transition-transform hover:scale-105"
            style={{ background: 'var(--accent-blue)' }}
          >
            ← На главную
          </a>
        </div>
      </div>
      </div>
    </>
  );
}

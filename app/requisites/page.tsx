import type { Metadata } from 'next';
import { LegalNavBar } from '@/components/LegalNavBar';

export const metadata: Metadata = {
  title: 'Реквизиты — Вечеринкач',
  description: 'Реквизиты самозанятого — информация об исполнителе услуг',
};

export default function RequisitesPage() {
  return (
    <>
      <LegalNavBar />
      <div className="min-h-screen flex items-center justify-center p-4 py-10">
      <div
        className="w-full max-w-2xl rounded-2xl shadow-lg p-8 md:p-12"
        style={{ background: 'var(--panel)', color: 'var(--foreground)' }}
      >
        <h1
          className="text-3xl md:text-4xl font-bold text-center mb-8"
          style={{ fontFamily: 'var(--font-comic-cat)' }}
        >
          Реквизиты
        </h1>

        <section className="space-y-6 text-base md:text-lg leading-relaxed">
          <div>
            <h2 className="font-semibold text-lg md:text-xl mb-2">Исполнитель</h2>
            <table className="w-full text-left">
              <tbody>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">Статус</td>
                  <td className="py-2">Самозанятый (плательщик налога на профессиональный доход)</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">ФИО</td>
                  <td className="py-2">Заднепровская Ирина Валентиновна</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">ИНН</td>
                  <td className="py-2">550503239538</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="font-semibold text-lg md:text-xl mb-2">Правовая информация</h2>
            <ul className="list-disc list-inside space-y-1 text-sm md:text-base opacity-90">
              <li>Деятельность ведётся в соответствии с Федеральным законом №&nbsp;422-ФЗ от 27.11.2018 «О проведении эксперимента по установлению специального налогового режима „Налог на профессиональный доход"».</li>
              <li>Самозанятый не является плательщиком НДС.</li>
              <li>По факту оплаты формируется чек в приложении «Мой налог» (ФНС России).</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-lg md:text-xl mb-2">Приём платежей</h2>
            <p className="text-sm md:text-base opacity-90">
              Приём платежей осуществляется через сервис ЮKassa (ООО «ЮМани», ОГРН&nbsp;1127711000031) в соответствии с офертой сервиса. Безопасность платежей обеспечивается стандартом PCI&nbsp;DSS.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-lg md:text-xl mb-2">Контакты</h2>
            <table className="w-full text-left text-sm md:text-base">
              <tbody>
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
          </div>

          <div>
            <h2 className="font-semibold text-lg md:text-xl mb-2">Документы</h2>
            <ul className="text-sm md:text-base space-y-1">
              <li>
                <a href="/offer" className="underline font-medium" style={{ color: 'var(--accent-blue)' }}>
                  Публичная оферта об оказании услуг
                </a>
              </li>
            </ul>
          </div>
        </section>

        <div className="mt-10 text-center">
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

'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TestPage() {
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  const runTests = async () => {
    setLogs([]);
    
    // Тест 1: Проверка переменных окружения
    addLog('🔍 Проверка переменных окружения...');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url) {
      addLog('❌ NEXT_PUBLIC_SUPABASE_URL не найден');
      return;
    }
    addLog(`✅ URL: ${url}`);
    
    if (!key) {
      addLog('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY не найден');
      return;
    }
    addLog(`✅ Key существует (длина: ${key.length})`);

    // Тест 2: Проверка клиента Supabase
    addLog('🔍 Проверка клиента Supabase...');
    if (!supabase) {
      addLog('❌ Клиент Supabase не инициализирован');
      return;
    }
    addLog('✅ Клиент Supabase инициализирован');

    // Тест 3: Простой запрос к questions (только чтение)
    addLog('🔍 Тест запроса к таблице questions...');
    try {
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, text')
        .limit(1);

      if (questionsError) {
        addLog(`❌ Ошибка запроса к questions: ${questionsError.message}`);
        addLog(`   Код: ${questionsError.code}, Детали: ${questionsError.details}`);
      } else {
        addLog(`✅ Запрос к questions успешен (найдено записей: ${questions?.length || 0})`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      addLog(`💥 Exception при запросе к questions: ${message}`);
    }

    // Тест 4: Запрос к rooms
    addLog('🔍 Тест запроса к таблице rooms...');
    try {
      const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('id, code')
        .limit(1);

      if (roomsError) {
        addLog(`❌ Ошибка запроса к rooms: ${roomsError.message}`);
        addLog(`   Код: ${roomsError.code}, Детали: ${roomsError.details}`);
      } else {
        addLog(`✅ Запрос к rooms успешен (найдено записей: ${rooms?.length || 0})`);
        if (rooms && rooms.length > 0) {
          addLog(`   Код комнаты: ${rooms[0].code}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      addLog(`💥 Exception при запросе к rooms: ${message}`);
    }

    // Тест 5: Попытка создать тестовую комнату
    addLog('🔍 Тест создания комнаты...');
    const testCode = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      const { data: newRoom, error: createError } = await supabase
        .from('rooms')
        .insert({
          code: testCode,
          current_question_index: 0,
          is_active: false,
        })
        .select()
        .single();

      if (createError) {
        addLog(`❌ Ошибка создания комнаты: ${createError.message}`);
        addLog(`   Код: ${createError.code}, Детали: ${createError.details}`);
      } else {
        addLog(`✅ Комната создана! ID: ${newRoom.id}, Code: ${newRoom.code}`);
        
        // Удаляем тестовую комнату
        await supabase.from('rooms').delete().eq('id', newRoom.id);
        addLog(`🗑️ Тестовая комната удалена`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      addLog(`💥 Exception при создании комнаты: ${message}`);
    }

    addLog('✅ Все тесты завершены');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Диагностика Supabase</h1>
        
        <button
          onClick={runTests}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold mb-6"
        >
          ▶️ Запустить тесты
        </button>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Логи:</h2>
          {logs.length === 0 ? (
            <p className="text-gray-500">Нажмите кнопку для запуска тестов</p>
          ) : (
            <div className="space-y-2 font-mono text-sm">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`p-2 rounded ${
                    log.includes('❌') || log.includes('💥')
                      ? 'bg-red-50 text-red-800'
                      : log.includes('✅')
                      ? 'bg-green-50 text-green-800'
                      : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

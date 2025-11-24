-- Проверяем вопросы
SELECT * FROM questions ORDER BY "order";

-- Если вопросов нет, выполните этот блок:
DELETE FROM questions;

INSERT INTO questions (text, "order", difficulty, points, option_a, option_b, option_c, option_d, correct_answer) VALUES
('Сколько будет 7 × 8?', 1, 'easy', 10, '54', '56', '64', '48', 'b'),
('Чему равен корень из 64?', 2, 'easy', 10, '6', '7', '8', '9', 'c'),
('Чему равно 15% от 200?', 3, 'medium', 20, '25', '30', '35', '40', 'b'),
('Решите: 3x + 5 = 20. Чему равен x?', 4, 'medium', 20, '3', '4', '5', '6', 'c'),
('Чему равна площадь треугольника с основанием 10 см и высотой 8 см?', 5, 'hard', 30, '80 см²', '40 см²', '20 см²', '18 см²', 'b'),
('Чему равно значение: 2³ + 3² - 5?', 6, 'hard', 30, '10', '12', '14', '16', 'b');

-- Проверяем результат
SELECT "order", text, difficulty, points FROM questions ORDER BY "order";

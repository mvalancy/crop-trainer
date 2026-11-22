// Each row is English, Arabic, Spanish, Mandarin and French, in selector order.
// The same question and caption are used by the film and the recording plan.
export const filmLessons = {
  labels: {
    tab:['Labels','التسميات','Etiquetas','标签','Étiquettes'],
    title:['Who knows the center?','من يعرف مركز النبتة؟','¿Quién conoce el centro?','谁知道中心在哪儿？','Qui connaît le centre ?'],
    line:['Look straight down. The simulator knows where it planted the lettuce. Its cross marks a label, the answer for training. The gold ring is a prediction. See the gap between them?',
      'انظر من الأعلى. تعرف المحاكاة أين زرعت الخسّة. تحدّد علامة التقاطع مركزها الحقيقي. هذا هو الجواب الذي يتعلّم منه النموذج. أمّا الحلقة الذهبية فهي توقّعه. هل ترى المسافة بين العلامتين؟',
      'Mira desde arriba. El simulador sabe dónde plantó la lechuga. La cruz marca una etiqueta, la respuesta para entrenar. El anillo dorado es una predicción. ¿Ves la distancia entre ambos?',
      '从正上方看。模拟器知道生菜种在哪里。十字标出了真实中心，这个标签就是训练时的答案。金色圆环是模型的预测。看到两者之间的距离了吗？',
      'Regarde du dessus. Le simulateur sait où il a planté la laitue. La croix marque une étiquette, la réponse pour l’entraînement. Le cercle doré est une prédiction. Vois-tu la distance entre les deux ?'],
    action:['Place a pin','ضع علامة','Coloca un marcador','放置标记','Placer un repère'],
    destination:'#placePin'
  },
  epoch: {
    tab:['Epoch','دورة تدريب','Época','训练轮次','Époque'],
    title:['What is one epoch?','ما دورة التدريب؟','¿Qué es una época?','什么是一轮训练？','Qu’est-ce qu’une époque ?'],
    line:['Follow the light across four practice examples. For each guess, loss measures how far the score is from its label. Training adjusts weights to reduce that loss. One pass through every example is an epoch.',
      'تابع الضوء وهو يمرّ بأربعة أمثلة تدريبية. نقارن درجة كلّ توقّع بالتسمية الصحيحة لنحسب الخسارة. يعدّل التدريب الأوزان لتقليل الخسارة. عندما يمرّ النموذج بجميع الأمثلة مرّة واحدة، تكتمل دورة تدريب.',
      'Sigue la luz por cuatro ejemplos de práctica. En cada predicción, la pérdida mide cuánto se aleja la puntuación de su etiqueta. El entrenamiento ajusta los pesos para reducir esa pérdida. Una pasada por todos los ejemplos es una época.',
      '跟着光点看四个练习样本。每次预测后，用损失衡量得分和标签之间的差距。训练会调整权重来减小损失。把所有样本都看过一遍，就叫一轮训练。',
      'Suis la lumière sur quatre exemples. Pour chaque prédiction, la perte mesure l’écart entre le score et son étiquette. Pendant l’entraînement, les poids changent pour réduire cette perte. Un passage sur tous les exemples forme une époque.'],
    action:['Train a detector','درّب كاشفًا','Entrena un detector','训练检测器','Entraîner un détecteur'],
    destination:'trainer/?plan=quick#controls'
  },
  validation: {
    tab:['Validation','التحقّق','Validación','验证','Validation'],
    title:['Will it work on a fresh field?','هل ينجح في حقل جديد؟','¿Funcionará en otro campo?','换块田还能找到吗？','Et sur une nouvelle parcelle ?'],
    line:['Freeze the weights. Open a planting held out of training. Three crosses mark known plants. The detector places three rings. Two match, one ring is extra, and one plant is missed. Counting pins alone would hide both mistakes.',
      'نثبّت الأوزان ونفتح حقلًا لم نستخدمه في التدريب. تشير ثلاث علامات تقاطع إلى النباتات المعروفة. يرسم الكاشف ثلاث حلقات. تتطابق حلقتان، وتبقى حلقة زائدة ونبتة لم يكتشفها. لو عددنا الحلقات وحدها لما لاحظنا الخطأين.',
      'Fija los pesos. Abre una parcela que no se usó para entrenar. Tres cruces marcan plantas conocidas. El detector coloca tres anillos. Dos aciertan, sobra un anillo y falta una planta. Contar solo los anillos ocultaría ambos errores.',
      '固定权重，打开一块没参与训练的田。三个十字标出已知植株。检测器放了三个圆环，两个匹配，一个多余，还有一株被漏掉。只数圆环就看不出这两种错误。',
      'Fige les poids. Ouvre une parcelle gardée à part pendant l’entraînement. Trois croix indiquent les plantes connues. Le détecteur pose trois cercles. Deux correspondent, un est en trop et une plante est oubliée. Compter les cercles masquerait les deux erreurs.'],
    action:['Check the matches','تحقّق من المطابقات','Comprueba los aciertos','检查匹配结果','Vérifier les correspondances'],
    destination:'trainer/#explore-test'
  },
  cutoff: {
    tab:['Cutoff','العتبة','Umbral','阈值','Seuil'],
    title:['Can fewer pins be better?','متى تكون العلامات الأقلّ أدقّ؟','¿Conviene poner menos anillos?','圆环越少越好吗？','Moins de cercles, est-ce mieux ?'],
    line:['Lift the score cutoff on the same field. Two faint rings disappear. The only pin left is correct. Precision counts the share of pins that match. Recall counts the share of plants found. Here we found just one of three.',
      'نرفع عتبة قبول التوقّع في الحقل نفسه. تختفي حلقتان باهتتان. العلامة الوحيدة الباقية صحيحة. الدقّة هي نسبة العلامات الصحيحة من جميع العلامات، والاسترجاع هو نسبة النباتات المكتشفة من جميع النباتات. هنا لم نكتشف سوى نبتة واحدة من ثلاث.',
      'Sube el umbral en la misma parcela. Desaparecen dos anillos tenues. El único que queda acierta. La precisión es la proporción de aciertos entre los anillos. La exhaustividad es la proporción de plantas encontradas. Aquí solo encontramos una de tres.',
      '在同一块田里调高分数阈值。两个较淡的圆环消失了，只剩下一个正确的标记。精确率看的是所有标记里有多少是正确的。召回率看的是所有植株里找到了多少。这里三株只找到了一株。',
      'Relève le seuil sur la même parcelle. Deux cercles pâles disparaissent. Le seul repère restant est juste. La précision indique la part des repères corrects. Le rappel indique la part des plantes trouvées. Ici, on en trouve une sur trois.'],
    action:['Try the cutoff','جرّب العتبة','Prueba el umbral','试试阈值','Essayer le seuil'],
    destination:'benchmark/#explore-compare'

  }
};

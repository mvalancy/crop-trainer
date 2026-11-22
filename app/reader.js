const menu = document.querySelector('.chapterMenu');
const narrow = matchMedia('(max-width:760px)');
function setMenuLayout() { menu.open = !narrow.matches; }
setMenuLayout();
narrow.addEventListener('change', setMenuLayout);

import {installFigureReader} from './guide-figures.js';
installFigureReader(document.querySelector('.guideChapter'));
import {installGuidePlots} from './guide-plots.js';
installGuidePlots(document.querySelector('.guideChapter'));

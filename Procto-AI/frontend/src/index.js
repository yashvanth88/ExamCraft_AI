import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Provider } from 'react-redux';
import store from './store';
import { useGetQuestionsByCourseIdQuery } from 'src/slices/examApiSlice';
// import { BrowserRouter } from 'react-router-dom';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Suspense>
    <Provider store={store}>
      <App />
    </Provider>
  </Suspense>,
);

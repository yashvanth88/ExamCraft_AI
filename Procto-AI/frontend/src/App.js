// Theme Provider
import { CssBaseline, ThemeProvider } from '@mui/material';
import { baselightTheme } from './theme/DefaultColors';
// Router Provider
import { RouterProvider, useRoutes } from 'react-router-dom';
import Router from './routes/Router';

// Redux Provider
import { Provider } from 'react-redux';
import store from './store';
// Tostify
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setUserInfo } from './slices/authSlice';
import axios from 'axios';

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    const name = params.get('name');
    const role = params.get('role');
    if (email && name && role) {
      dispatch(setUserInfo({ email, name, role }));
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userName', name);
      localStorage.setItem('userRole', role);
    }
  }, [dispatch]);

  // const routing = useRoutes(Router);
  const theme = baselightTheme;
  return (
    <ThemeProvider theme={theme}>
      <Provider store={store}>
        <ToastContainer />
        <CssBaseline />
        {/* {routing} */}
        <RouterProvider router={Router} />
      </Provider>
    </ThemeProvider>
  );
}

export default App;

// This file serves as a central hub for re-exporting pre-typed Redux hooks.
// These imports are restricted elsewhere to ensure consistent
// usage of typed hooks throughout the application.
// We disable the ESLint rule here because this is the designated place
// for importing and re-exporting the typed versions of hooks.
/* eslint-disable @typescript-eslint/no-restricted-imports */
import { useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from './store';

/**
 * Custom typed useDispatch hook.
 * 
 * This hook provides a type-safe way to dispatch actions in your components.
 * It should be used instead of the standard `useDispatch` from react-redux.
 * 
 * @example
 * const dispatch = useAppDispatch();
 * dispatch(someAction());
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()

/**
 * Custom typed useSelector hook.
 * 
 * This hook provides a type-safe way to select state in your components.
 * It should be used instead of the standard `useSelector` from react-redux.
 * 
 * @example
 * const someValue = useAppSelector(state => state.some.value);
 */
export const useAppSelector = useSelector.withTypes<RootState>()

import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children?: React.ReactNode;
  className?: string;
}
export declare const Button: React.FC<ButtonProps>;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  hover?: boolean;
}
export declare const Card: React.FC<CardProps>;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
}
export declare const Input: React.FC<InputProps>;

export interface ModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}
export declare const Modal: React.FC<ModalProps>;

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  width?: string | number;
  height?: string | number;
}
export declare const Skeleton: React.FC<SkeletonProps>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'error';
  children?: React.ReactNode;
  className?: string;
}
export declare const Badge: React.FC<BadgeProps>;

export interface StepDotsProps {
  total: number;
  current: number;
  className?: string;
  onStepClick?: (step: number) => void;
}
export declare const StepDots: React.FC<StepDotsProps>;

export declare const colors: Record<string, string>;

/**
 * Form validation schemas.
 * Pure functions returning error messages or null.
 */

export function validateEmail(email: string): string | null {
    if (!email || email.trim().length === 0) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return null;
}

export function validatePassword(password: string): string | null {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain a number';
    return null;
}

export function validateName(name: string): string | null {
    if (!name || name.trim().length === 0) return 'Name is required';
    if (name.trim().length < 2) return 'Name must be at least 2 characters';
    if (name.trim().length > 50) return 'Name must be less than 50 characters';
    return null;
}

export function validateWeight(weight: string | number): string | null {
    const num = typeof weight === 'string' ? parseFloat(weight) : weight;
    if (isNaN(num)) return 'Please enter a valid weight';
    if (num < 20 || num > 300) return 'Weight must be between 20–300 kg';
    return null;
}

export function validateHeight(height: string | number): string | null {
    const num = typeof height === 'string' ? parseFloat(height) : height;
    if (isNaN(num)) return 'Please enter a valid height';
    if (num < 100 || num > 250) return 'Height must be between 100–250 cm';
    return null;
}

export function validateAge(age: string | number): string | null {
    const num = typeof age === 'string' ? parseInt(age, 10) : age;
    if (isNaN(num)) return 'Please enter a valid age';
    if (num < 16 || num > 100) return 'Age must be between 16–100';
    return null;
}

/**
 * Run multiple validators, return first error or null.
 */
export function validate(
    ...validators: Array<() => string | null>
): string | null {
    for (const v of validators) {
        const error = v();
        if (error) return error;
    }
    return null;
}
